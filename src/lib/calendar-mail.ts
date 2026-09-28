// Calendar mails for a slot (TECH_DESIGN 6.4, PRD 4.7). Server only.
//
// Callers take a snapshot of the slot (who sits in it, where, when) before
// they change it, write the change with ics_sequence + 1, then send with the
// new sequence: invitations to the people now in the slot, cancellations to
// the people who left. One mail per recipient. Mails never block the change
// itself; failures are counted and reported to the caller.
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/auth/login";
import { buildIcs, type CalendarMethod } from "@/lib/calendar";
import { organizer, sendMail, type Mail, type MailTransport, type SendOptions } from "@/lib/mail/send";
import {
  bookingCancelledMail,
  bookingConfirmedMail,
  formatSlot,
  interviewCancelledMail,
  interviewInviteMail,
  type SlotText,
} from "@/lib/mail/templates";

export type Person = { id: string; name: string; email: string };

export type SlotSnapshot = {
  id: string;
  startsAt: string;
  interviewEndsAt: string;
  location: string;
  sequence: number;
  applicant: Person | null;
  /** Empty or both. */
  interviewers: Person[];
  mail: SendOptions & { transport: MailTransport };
  rebookHoursBefore: number;
};

/** "0.23" → "Raum 0.23"; names like "Seminarraum 1" stay. */
export function roomLabel(name: string): string {
  return /^\d/.test(name) ? `Raum ${name}` : name;
}

type SnapshotRow = {
  id: string;
  starts_at: string;
  interview_ends_at: string;
  ics_sequence: number;
  interviewer_a: string | null;
  interviewer_b: string | null;
  applicant_id: string | null;
  locations: { name: string };
  rounds: { mail_transport: MailTransport; reply_to: string; rebook_hours_before: number };
};

/** Reads everything the mails need. Works with the secret key or an admin session. */
export async function snapshotSlot(db: SupabaseClient, slotId: string): Promise<SlotSnapshot | null> {
  const { data, error } = await db
    .from("slots")
    .select(
      `id, starts_at, interview_ends_at, ics_sequence, interviewer_a, interviewer_b, applicant_id,
       locations!inner (name), rounds!inner (mail_transport, reply_to, rebook_hours_before)`,
    )
    .eq("id", slotId)
    .maybeSingle<SnapshotRow>();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const memberIds = [data.interviewer_a, data.interviewer_b].filter((id): id is string => !!id);
  const [members, applicant] = await Promise.all([
    memberIds.length
      ? db.from("team_members").select("id, name, email").in("id", memberIds).returns<Person[]>()
      : Promise.resolve({ data: [] as Person[], error: null }),
    data.applicant_id
      ? db.from("applicants").select("id, name, email").eq("id", data.applicant_id).maybeSingle<Person>()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (applicant.error) throw new Error(applicant.error.message);

  return {
    id: data.id,
    startsAt: data.starts_at,
    interviewEndsAt: data.interview_ends_at,
    location: roomLabel(data.locations.name),
    sequence: data.ics_sequence,
    applicant: applicant.data,
    interviewers: memberIds.map((id) => members.data!.find((m) => m.id === id)).filter((m): m is Person => !!m),
    mail: { transport: data.rounds.mail_transport, replyTo: data.rounds.reply_to },
    rebookHoursBefore: data.rounds.rebook_hours_before,
  };
}

function slotText(slot: SlotSnapshot): SlotText {
  return { when: formatSlot(new Date(slot.startsAt), new Date(slot.interviewEndsAt)), location: slot.location };
}

function ics(slot: SlotSnapshot, method: CalendarMethod, to: Person, summary: string, description: string) {
  return {
    method,
    content: buildIcs({
      method,
      slotId: slot.id,
      sequence: slot.sequence,
      startsAt: slot.startsAt,
      endsAt: slot.interviewEndsAt,
      summary,
      location: slot.location,
      description,
      organizer: organizer(slot.mail.transport),
      attendee: { name: to.name, email: to.email },
    }),
  };
}

const APPLICANT_SUMMARY = "Gespräch mit dem Orga-Team der Law Clinic";
const memberSummary = (applicant: Person) => `Bewerbungsgespräch: ${applicant.name}`;

export type Deliver = typeof sendMail;

/** Sends one by one and returns how many failed. */
async function deliver(mails: Mail[], options: SendOptions, send: Deliver): Promise<number> {
  let failed = 0;
  for (const mail of mails) {
    try {
      await send(mail, options);
    } catch (e) {
      console.error("calendar mail failed", mail.subject, e);
      failed++;
    }
  }
  return failed;
}

/**
 * Invitations for the slot as it is now (sequence already raised).
 * applicant: whether and how the applicant is told; url is left out when the
 * token is unknown (entered by an admin). members: which interviewers.
 */
export async function sendInvitations(
  slot: SlotSnapshot,
  recipients: { applicant?: { url?: string; rebooked: boolean }; memberIds: string[] },
  send: Deliver = sendMail,
): Promise<number> {
  const mails: Mail[] = [];
  const text = slotText(slot);
  const applicant = slot.applicant;
  if (applicant && recipients.applicant) {
    mails.push({
      to: applicant.email,
      ...bookingConfirmedMail({
        name: applicant.name,
        slot: text,
        url: recipients.applicant.url,
        rebookUntil: new Date(Date.parse(slot.startsAt) - slot.rebookHoursBefore * 3_600_000),
        rebooked: recipients.applicant.rebooked,
      }),
      ics: ics(slot, "REQUEST", applicant, APPLICANT_SUMMARY, `${text.when}\nOrt: ${text.location}`),
    });
  }
  if (applicant) {
    for (const member of slot.interviewers.filter((m) => recipients.memberIds.includes(m.id))) {
      const partner = slot.interviewers.find((m) => m.id !== member.id);
      mails.push({
        to: member.email,
        ...interviewInviteMail({
          memberName: member.name,
          applicantName: applicant.name,
          partnerName: partner?.name ?? "",
          slot: text,
          url: appUrl(),
        }),
        ics: ics(slot, "REQUEST", member, memberSummary(applicant), `Bewerbungsgespräch mit ${applicant.name}, zusammen mit ${partner?.name ?? ""}.\n${appUrl()}`),
      });
    }
  }
  return deliver(mails, slot.mail, send);
}

/**
 * Cancellations for the slot as it was (snapshot before the change) with the
 * new sequence. applicant: whether the applicant is told, and why.
 */
export async function sendCancellations(
  slot: SlotSnapshot,
  recipients: { applicant?: { rebooked: boolean }; memberIds: string[] },
  send: Deliver = sendMail,
): Promise<number> {
  const applicant = slot.applicant;
  if (!applicant) return 0;
  const mails: Mail[] = [];
  const text = slotText(slot);
  if (recipients.applicant) {
    mails.push({
      to: applicant.email,
      ...bookingCancelledMail({ name: applicant.name, slot: text, rebooked: recipients.applicant.rebooked }),
      ics: ics(slot, "CANCEL", applicant, APPLICANT_SUMMARY, "Abgesagt."),
    });
  }
  for (const member of slot.interviewers.filter((m) => recipients.memberIds.includes(m.id))) {
    mails.push({
      to: member.email,
      ...interviewCancelledMail({ memberName: member.name, applicantName: applicant.name, slot: text }),
      ics: ics(slot, "CANCEL", member, memberSummary(applicant), "Abgesagt."),
    });
  }
  return deliver(mails, slot.mail, send);
}

/** User-facing note after a change whose mails did not all go out. */
export function mailWarning(failed: number): string | undefined {
  if (!failed) return undefined;
  return failed === 1
    ? "Eine Kalendermail konnte nicht verschickt werden. Bitte die Beteiligten selbst informieren."
    : `${failed} Kalendermails konnten nicht verschickt werden. Bitte die Beteiligten selbst informieren.`;
}

/**
 * Before a withdrawal: frees the applicant's slot (and its pair) and cancels
 * it for the interviewers. The applicant gets no mail; their data is deleted.
 */
export async function releaseForWithdrawal(db: SupabaseClient, applicantId: string, send: Deliver = sendMail): Promise<void> {
  const { data, error } = await db.from("slots").select("id").eq("applicant_id", applicantId).maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  if (!data) return;
  const before = await snapshotSlot(db, data.id);
  if (!before) return;
  const freed = await db
    .from("slots")
    .update({ applicant_id: null, booked_at: null, interviewer_a: null, interviewer_b: null, ics_sequence: before.sequence + 1 })
    .eq("id", data.id);
  if (freed.error) throw new Error(freed.error.message);
  await sendCancellations({ ...before, sequence: before.sequence + 1 }, { memberIds: before.interviewers.map((m) => m.id) }, send);
}
