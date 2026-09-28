// Booking and rebooking on /b/[token] (Phase 12, TECH_DESIGN 6.3). Server only.
//
// The applicant page uses the secret-key client, bound to the applicant behind
// the token. The server chooses the pair (pairFor → choosePair) and the
// database function book_slot checks every rule again under the round's lock.
// If a parallel booking took one of the chosen people, the next pair is tried.
// Mails go after the booking is saved; a failed mail never undoes it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/auth/member";
import { appUrl } from "@/lib/auth/login";
import { createToken, hashToken } from "@/lib/applicant-token";
import { findApplicant, type Applicant } from "@/lib/application";
import { roomLabel, sendCancellations, sendInvitations, snapshotSlot, type Deliver } from "@/lib/calendar-mail";
import { sendMail } from "@/lib/mail/send";
import { bookNowMail } from "@/lib/mail/templates";
import { hintContext, loadScheduling } from "@/lib/scheduling";
import { bookingDeadline, isBookable, offersFor, pairFor } from "@/lib/scheduling-rules";

export type Offer = { id: string; startsAt: string; interviewEndsAt: string; location: string };

export type BookingState = {
  /** The booked slot, or null. */
  booked: Offer | null;
  /** Until when the booked slot can be changed. */
  rebookUntil: Date | null;
  canRebook: boolean;
  /** Free slots this applicant can book, by start (without the own one). */
  offers: Offer[];
  /** false: the round has no slots at all yet (still being planned). */
  planned: boolean;
  interviewMinutes: number;
  rebookHoursBefore: number;
};

export async function loadBooking(db: SupabaseClient, applicant: Applicant, now = new Date()): Promise<BookingState> {
  const data = await loadScheduling(db, applicant.round.id);
  const context = hintContext(data);
  const room = new Map(data.locations.map((l) => [l.id, roomLabel(l.name)]));
  const toOffer = (s: (typeof data.slots)[number]): Offer => ({
    id: s.id,
    startsAt: s.startsAt,
    interviewEndsAt: s.interviewEndsAt,
    location: room.get(s.locationId) ?? "",
  });

  const own = data.slots.find((s) => s.applicantId === applicant.id) ?? null;
  const rebookUntil = own ? bookingDeadline(own.startsAt, data.round.rebookHoursBefore) : null;
  return {
    booked: own && toOffer(own),
    rebookUntil,
    canRebook: !!rebookUntil && now < rebookUntil,
    offers: offersFor(context, applicant.id, data.round.rebookHoursBefore, now).map(toOffer),
    planned: data.slots.length > 0,
    interviewMinutes: data.round.interviewMinutes,
    rebookHoursBefore: data.round.rebookHoursBefore,
  };
}

export type BookResult =
  | { status: "booked"; mailFailed: boolean }
  | { status: "notfound" }
  /** Someone else was faster, or no pair is left for this slot. */
  | { status: "taken" }
  | { status: "error"; message: string };

const RETRIES = 3;
/** Rules a parallel booking can break for the chosen pair: try the next pair. */
const RETRY_HINTS = new Set(["person_overlap", "over_limit", "member_unavailable", "pair_changed"]);

type BookSlotResult = { old_slot_id: string | null; old_sequence: number | null; new_sequence: number };

/** Books slotId for the applicant behind the token; a booked applicant is rebooked. */
export async function bookSlot(
  db: SupabaseClient,
  token: string,
  slotId: string,
  { send = sendMail, url }: { send?: Deliver; url?: string } = {},
): Promise<BookResult> {
  const applicant = await findApplicant(db, token);
  if (!applicant) return { status: "notfound" };

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const data = await loadScheduling(db, applicant.round.id);
    const slot = data.slots.find((s) => s.id === slotId);
    if (!slot || slot.applicantId) return { status: "taken" };
    const pair = pairFor(slot, hintContext(data), applicant.id);
    if (!pair) return { status: "taken" };

    const own = data.slots.find((s) => s.applicantId === applicant.id);
    const before = own ? await snapshotSlot(db, own.id) : null;

    const { data: result, error } = await db.rpc("book_slot", {
      p_slot_id: slotId,
      p_applicant_id: applicant.id,
      p_interviewer_a: pair.interviewerA,
      p_interviewer_b: pair.interviewerB,
    });
    if (error) {
      if (error.hint && RETRY_HINTS.has(error.hint)) continue;
      // Unique applicant_id: the same applicant booked twice at once.
      if (error.hint === "slot_taken" || error.hint === "slot_gone" || error.code === "23505" || error.code === "23P01") {
        return { status: "taken" };
      }
      if (error.hint === "too_late") return { status: "error", message: "Dieser Termin ist zu kurzfristig. Bitte wähle einen späteren." };
      if (error.hint === "rebook_closed") {
        return { status: "error", message: "Die Frist zum Umbuchen ist abgelaufen. Dein bisheriger Termin bleibt." };
      }
      if (error.hint === "applicant_gone") return { status: "notfound" };
      throw new Error(`book_slot failed: ${error.message}`);
    }

    const booked = result as BookSlotResult;
    const personal = url ?? new URL(`/b/${token}`, appUrl()).toString();
    const rebooked = !!booked.old_slot_id;
    let failed = 0;
    if (before && booked.old_sequence !== null) {
      failed += await sendCancellations(
        { ...before, sequence: booked.old_sequence },
        { applicant: { rebooked: true }, memberIds: before.interviewers.map((m) => m.id) },
        send,
      );
    }
    const after = await snapshotSlot(db, slotId);
    if (after) {
      failed += await sendInvitations(
        after,
        { applicant: { url: personal, rebooked }, memberIds: after.interviewers.map((m) => m.id) },
        send,
      );
    }
    return { status: "booked", mailFailed: failed > 0 };
  }
  return { status: "taken" };
}

export type BookNowResult = { ok: true; sent: number; failed: number } | { error: string };

/**
 * Admin: mails every applicant without a slot a new personal link to book.
 * Only the hash of a token is stored, so the link is new and older ones stop
 * working (like the "Dein neuer Link" mail). If a mail fails, the old link
 * is restored.
 */
export async function inviteToBook(session: SupabaseClient, roundId: string, send: Deliver = sendMail): Promise<BookNowResult> {
  const { member } = await getMember(session);
  if (member?.role !== "admin") return { error: "Das dürfen nur Admins." };

  const data = await loadScheduling(session, roundId);
  const context = hintContext(data);
  if (!data.slots.some((s) => isBookable(s, context))) {
    return { error: "Es gibt gerade keine buchbaren Termine. Bitte zuerst Termine erzeugen." };
  }
  const booked = new Set(data.slots.map((s) => s.applicantId).filter(Boolean));
  const waiting = data.applicants.filter((a) => !booked.has(a.id));

  const round = await session.from("rounds").select("mail_transport, reply_to").eq("id", roundId).single<{
    mail_transport: "gmail" | "graph";
    reply_to: string;
  }>();
  if (round.error) return { error: round.error.message };

  let sent = 0;
  let failed = 0;
  for (const applicant of waiting) {
    const row = await session
      .from("applicants")
      .select("email, token_hash")
      .eq("id", applicant.id)
      .maybeSingle<{ email: string; token_hash: string }>();
    if (!row.data) continue;
    const token = createToken();
    const { error } = await session.from("applicants").update({ token_hash: hashToken(token) }).eq("id", applicant.id);
    if (error) {
      failed++;
      continue;
    }
    try {
      await send(
        { to: row.data.email, ...bookNowMail({ name: applicant.name, url: new URL(`/b/${token}`, appUrl()).toString() }) },
        { transport: round.data.mail_transport, replyTo: round.data.reply_to },
      );
      sent++;
    } catch (e) {
      console.error("book-now mail failed", e);
      // Without the mail the new link is lost: the old one works again.
      await session.from("applicants").update({ token_hash: row.data.token_hash }).eq("id", applicant.id);
      failed++;
    }
  }
  return { ok: true, sent, failed };
}
