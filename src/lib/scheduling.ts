// Slots in /terminplanung (Phase 11). Reads and writes with the admin's
// session, so RLS enforces "admins only".
//
// Fynn, 29.09.2026: the tool offers every possible time (offerTimes) as time +
// location, bookable at once, also during the application phase. The pair is
// chosen at booking (choosePair) unless an admin fixed one. Overlaps per
// location (exclusion constraint) and per person (trigger) are rejected by the
// database and only translated here. Time and location of a booked slot stay
// fixed (Fynn, 29.09.2026: remove the applicant and enter them elsewhere).
// Entering, removing and changing the pair of a booked slot send calendar
// mails (calendar-mail.ts) with ics_sequence + 1.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/auth/member";
import { normalizeInstant } from "@/lib/availability-grid";
import { berlinToUtc } from "@/lib/berlin-time";
import { loadLocations, type Location } from "@/lib/locations";
import type { HintContext, HintMember, PlannedSlot, SlotStatus } from "@/lib/scheduling-rules";
import { choosePair, offerTimes } from "@/lib/slot-offers";
import { mailWarning, sendCancellations, sendInvitations, snapshotSlot, type Deliver } from "@/lib/calendar-mail";

export type SchedulingMember = HintMember & { preferred: boolean };

export type Scheduling = {
  round: { id: string; interviewMinutes: number; bufferMinutes: number; interviewsFrom: string; rebookHoursBefore: number };
  /** Active members plus anyone who sits in a slot; by name. */
  members: SchedulingMember[];
  /** Default location first. */
  locations: Location[];
  /** By start. */
  slots: PlannedSlot[];
  applicants: { id: string; name: string }[];
  conflicts: { applicantId: string; memberId: string }[];
};

/** warning: the change is saved, but calendar mails failed. */
export type SchedulingResult = { ok: true; warning?: string } | { error: string };

const NOT_ALLOWED = { error: "Das dürfen nur Admins." } as const;
const GONE = { error: "Den Termin gibt es nicht mehr. Bitte Seite neu laden." } as const;
const PAGE = 1000;

async function isAdmin(session: SupabaseClient): Promise<boolean> {
  const { member } = await getMember(session);
  return member?.role === "admin";
}

/** PostgREST returns at most 1000 rows per request; availabilities can exceed that. */
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

type SlotRow = {
  id: string;
  location_id: string;
  starts_at: string;
  interview_ends_at: string;
  ends_at: string;
  interviewer_a: string | null;
  interviewer_b: string | null;
  status: SlotStatus;
  applicant_id: string | null;
};

const SLOT_COLUMNS = "id, location_id, starts_at, interview_ends_at, ends_at, interviewer_a, interviewer_b, status, applicant_id";

const toSlot = (row: SlotRow): PlannedSlot => ({
  id: row.id,
  locationId: row.location_id,
  startsAt: normalizeInstant(row.starts_at)!,
  interviewEndsAt: normalizeInstant(row.interview_ends_at)!,
  endsAt: normalizeInstant(row.ends_at)!,
  interviewerA: row.interviewer_a,
  interviewerB: row.interviewer_b,
  status: row.status,
  applicantId: row.applicant_id,
});

export async function loadScheduling(session: SupabaseClient, roundId: string): Promise<Scheduling> {
  const round = await session
    .from("rounds")
    .select("id, interview_minutes, buffer_minutes, interviews_from, rebook_hours_before")
    .eq("id", roundId)
    .single<{ id: string; interview_minutes: number; buffer_minutes: number; interviews_from: string; rebook_hours_before: number }>();
  if (round.error) throw new Error(round.error.message);

  const [team, settings, cells, slots, applicants, conflicts, locations] = await Promise.all([
    session.from("team_members").select("id, name, active").returns<{ id: string; name: string; active: boolean }[]>(),
    session
      .from("member_round_settings")
      .select("member_id, max_interviews, preferred")
      .eq("round_id", roundId)
      .returns<{ member_id: string; max_interviews: number | null; preferred: boolean }[]>(),
    fetchAll<{ member_id: string; starts_at: string }>((from, to) =>
      session.from("availabilities").select("member_id, starts_at").eq("round_id", roundId).order("id").range(from, to),
    ),
    session.from("slots").select(SLOT_COLUMNS).eq("round_id", roundId).order("starts_at").returns<SlotRow[]>(),
    session.from("applicants").select("id, name").eq("round_id", roundId).order("name").returns<{ id: string; name: string }[]>(),
    session
      .from("conflicts")
      .select("applicant_id, member_id, applicants!inner (round_id)")
      .eq("applicants.round_id", roundId)
      .returns<{ applicant_id: string; member_id: string }[]>(),
    loadLocations(session, roundId),
  ]);
  for (const result of [team, settings, slots, applicants, conflicts]) if (result.error) throw new Error(result.error.message);

  const plannedSlots = slots.data!.map(toSlot);
  const inSlots = new Set(plannedSlots.flatMap((s) => [s.interviewerA, s.interviewerB]));
  const cellsOf = new Map<string, string[]>();
  for (const row of cells) {
    const list = cellsOf.get(row.member_id) ?? [];
    list.push(normalizeInstant(row.starts_at)!);
    cellsOf.set(row.member_id, list);
  }

  const members = team
    .data!.filter((m) => m.active || inSlots.has(m.id))
    .map((m) => {
      const own = settings.data!.find((s) => s.member_id === m.id);
      return {
        id: m.id,
        name: m.name,
        active: m.active,
        preferred: own?.preferred ?? false,
        maxInterviews: own?.max_interviews ?? null,
        cells: (cellsOf.get(m.id) ?? []).sort(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return {
    round: {
      id: round.data.id,
      interviewMinutes: round.data.interview_minutes,
      bufferMinutes: round.data.buffer_minutes,
      interviewsFrom: round.data.interviews_from,
      rebookHoursBefore: round.data.rebook_hours_before,
    },
    members,
    locations,
    slots: plannedSlots,
    applicants: applicants.data!,
    conflicts: conflicts.data!.map((c) => ({ applicantId: c.applicant_id, memberId: c.member_id })),
  };
}

const blockedOf = (data: Scheduling) =>
  data.locations.flatMap((l) => l.blockedTimes.map((b) => ({ locationId: l.id, startsAt: b.startsAt, endsAt: b.endsAt })));

/** For capacity and hints (scheduling-rules.ts). */
export function hintContext(data: Scheduling): HintContext {
  return { members: data.members, slots: data.slots, conflicts: data.conflicts, blocked: blockedOf(data) };
}

/** Adds every slot that is possible now; existing slots stay. */
export async function generateSlots(
  session: SupabaseClient,
  roundId: string,
): Promise<{ ok: true; created: number } | { error: string }> {
  if (!(await isAdmin(session))) return NOT_ALLOWED;
  const data = await loadScheduling(session, roundId);
  if (!data.locations.length) return { error: "Lege zuerst einen Ort an." };

  const offered = offerTimes({
    // Deactivated members are left out (slot-offers.ts).
    members: data.members.filter((m) => m.active),
    locations: data.locations.map((l) => ({ id: l.id })),
    blocked: blockedOf(data),
    existing: data.slots,
    interviewMinutes: data.round.interviewMinutes,
    bufferMinutes: data.round.bufferMinutes,
  });
  if (!offered.length) return { ok: true, created: 0 };

  const { error } = await session.from("slots").insert(
    offered.map((s) => ({
      round_id: roundId,
      location_id: s.locationId,
      starts_at: s.startsAt,
      interview_ends_at: s.interviewEndsAt,
      ends_at: s.endsAt,
      status: "confirmed",
    })),
  );
  if (error) return { error: await translate(session, error) };
  return { ok: true, created: offered.length };
}

/** Deletes every slot of the round nobody has booked. */
export async function deleteFreeSlots(session: SupabaseClient, roundId: string): Promise<SchedulingResult> {
  if (!(await isAdmin(session))) return NOT_ALLOWED;
  const { error } = await session.from("slots").delete().eq("round_id", roundId).is("applicant_id", null);
  return error ? { error: error.message } : { ok: true };
}

export async function deleteSlot(session: SupabaseClient, id: string): Promise<SchedulingResult> {
  if (!(await isAdmin(session))) return NOT_ALLOWED;
  const { data, error } = await session.from("slots").delete().eq("id", id).is("applicant_id", null).select("id");
  if (error) return { error: error.message };
  return data.length ? { ok: true } : { error: "Der Termin ist gebucht oder existiert nicht mehr. Bitte Seite neu laden." };
}

/** Both empty = no pair; otherwise two different members. */
function readPair(a: string, b: string): { pair: [string, string] | null } | { error: string } {
  if (!a && !b) return { pair: null };
  if (!a || !b) return { error: "Bitte beide Gesprächsführer wählen oder beide leer lassen." };
  if (a === b) return { error: "Bitte zwei verschiedene Gesprächsführer wählen." };
  return { pair: [a, b] };
}

export type SlotInput = {
  roundId: string;
  /** Missing = new slot. */
  id?: string;
  locationId: string;
  /** datetime-local, Berlin time. */
  startsAt: string;
  /** Both empty = the pair is chosen at booking. */
  interviewerA: string;
  interviewerB: string;
};

/** Creates or changes a free slot; the ends follow from the round's interview and buffer length. */
export async function saveSlot(session: SupabaseClient, input: SlotInput): Promise<SchedulingResult> {
  const startsAt = berlinToUtc(input.startsAt);
  if (!startsAt) return { error: "Bitte Tag und Uhrzeit angeben." };
  if (!input.locationId) return { error: "Bitte einen Ort wählen." };
  const pair = readPair(input.interviewerA, input.interviewerB);
  if ("error" in pair) return pair;
  if (!(await isAdmin(session))) return NOT_ALLOWED;

  const round = await session
    .from("rounds")
    .select("interview_minutes, buffer_minutes")
    .eq("id", input.roundId)
    .maybeSingle<{ interview_minutes: number; buffer_minutes: number }>();
  if (round.error) return { error: round.error.message };
  if (!round.data) return { error: "Die Runde gibt es nicht mehr. Bitte Seite neu laden." };

  const start = Date.parse(startsAt);
  const interviewEnd = start + round.data.interview_minutes * 60_000;
  const row = {
    round_id: input.roundId,
    location_id: input.locationId,
    starts_at: startsAt,
    interview_ends_at: new Date(interviewEnd).toISOString(),
    ends_at: new Date(interviewEnd + round.data.buffer_minutes * 60_000).toISOString(),
    interviewer_a: pair.pair?.[0] ?? null,
    interviewer_b: pair.pair?.[1] ?? null,
  };

  if (!input.id) {
    const { error } = await session.from("slots").insert({ ...row, status: "confirmed" });
    return error ? { error: await translate(session, error) } : { ok: true };
  }
  const { data, error } = await session.from("slots").update(row).eq("id", input.id).is("applicant_id", null).select("id");
  if (error) return { error: await translate(session, error) };
  return data.length ? { ok: true } : { error: "Der Termin ist gebucht oder existiert nicht mehr. Bitte Seite neu laden." };
}

/**
 * Fixes or changes the pair of any slot; both empty frees a free slot's pair
 * again. On a booked slot, whoever leaves gets a cancellation and the new pair
 * an invitation.
 */
export async function setPair(
  session: SupabaseClient,
  slotId: string,
  a: string,
  b: string,
  send?: Deliver,
): Promise<SchedulingResult> {
  const pair = readPair(a, b);
  if ("error" in pair) return pair;
  if (!(await isAdmin(session))) return NOT_ALLOWED;
  const before = await snapshotSlot(session, slotId);
  if (!before) return GONE;
  const booked = !!before.applicant;
  if (booked && !pair.pair) return { error: "Ein gebuchter Termin braucht zwei Gesprächsführer." };

  const { data, error } = await session
    .from("slots")
    .update({
      interviewer_a: pair.pair?.[0] ?? null,
      interviewer_b: pair.pair?.[1] ?? null,
      ...(booked && { ics_sequence: before.sequence + 1 }),
    })
    .eq("id", slotId)
    .select("id");
  if (error) return { error: await translate(session, error) };
  if (!data.length) return GONE;
  if (!booked) return { ok: true };

  const next = pair.pair!;
  const left = before.interviewers.map((m) => m.id).filter((id) => !next.includes(id));
  if (!left.length) return { ok: true };
  const after = await snapshotSlot(session, slotId);
  const failed =
    (await sendCancellations({ ...before, sequence: before.sequence + 1 }, { memberIds: left }, send)) +
    (after ? await sendInvitations(after, { memberIds: next }, send) : 0);
  return { ok: true, warning: mailWarning(failed) };
}

/**
 * Admin enters an applicant by hand. A slot without a pair gets one the way a
 * booking will (choosePair, without members conflicted with the applicant).
 * No calendar mail before Phase 12.
 */
export async function assignApplicant(
  session: SupabaseClient,
  slotId: string,
  applicantId: string,
  send?: Deliver,
): Promise<SchedulingResult> {
  if (!applicantId) return { error: "Bitte einen Bewerber wählen." };
  if (!(await isAdmin(session))) return NOT_ALLOWED;

  const slot = await session
    .from("slots")
    .select(`round_id, ics_sequence, ${SLOT_COLUMNS}`)
    .eq("id", slotId)
    .maybeSingle<SlotRow & { round_id: string; ics_sequence: number }>();
  if (slot.error) return { error: slot.error.message };
  if (!slot.data) return GONE;
  if (slot.data.applicant_id) return { error: "Der Termin ist schon vergeben. Bitte Seite neu laden." };

  let pair: { interviewerA: string; interviewerB: string } | null = slot.data.interviewer_a
    ? { interviewerA: slot.data.interviewer_a, interviewerB: slot.data.interviewer_b! }
    : null;
  if (!pair) {
    const data = await loadScheduling(session, slot.data.round_id);
    pair = choosePair({
      slot: toSlot(slot.data),
      members: data.members.filter((m) => m.active),
      slots: data.slots.filter((s) => s.id !== slotId),
      excluded: data.conflicts.filter((c) => c.applicantId === applicantId).map((c) => c.memberId),
    });
    if (!pair) return { error: "Zu dieser Zeit ist kein passendes Paar frei. Bitte das Paar von Hand festlegen." };
  }

  const { data, error } = await session
    .from("slots")
    .update({
      applicant_id: applicantId,
      booked_at: new Date().toISOString(),
      interviewer_a: pair.interviewerA,
      interviewer_b: pair.interviewerB,
      ics_sequence: slot.data.ics_sequence + 1,
    })
    .eq("id", slotId)
    .is("applicant_id", null)
    .select("id");
  if (error?.code === "23505") return { error: "Dieser Bewerber hat schon einen Termin." };
  if (error) return { error: await translate(session, error) };
  if (!data.length) return { error: "Der Termin ist schon vergeben. Bitte Seite neu laden." };

  // The applicant's token is unknown here, so the mail points to the first mail's link.
  const after = await snapshotSlot(session, slotId);
  const failed = after
    ? await sendInvitations(after, { applicant: { rebooked: false }, memberIds: [pair.interviewerA, pair.interviewerB] }, send)
    : 0;
  return { ok: true, warning: mailWarning(failed) };
}

/** Frees a booked slot and its pair, so the next booking chooses again; everyone gets a cancellation. */
export async function unassignApplicant(session: SupabaseClient, slotId: string, send?: Deliver): Promise<SchedulingResult> {
  if (!(await isAdmin(session))) return NOT_ALLOWED;
  const before = await snapshotSlot(session, slotId);
  if (!before) return GONE;
  const { data, error } = await session
    .from("slots")
    .update({ applicant_id: null, booked_at: null, interviewer_a: null, interviewer_b: null, ics_sequence: before.sequence + 1 })
    .eq("id", slotId)
    .select("id");
  if (error) return { error: error.message };
  if (!data.length) return GONE;
  const failed = await sendCancellations(
    { ...before, sequence: before.sequence + 1 },
    { applicant: { rebooked: false }, memberIds: before.interviewers.map((m) => m.id) },
    send,
  );
  return { ok: true, warning: mailWarning(failed) };
}

export async function setPreferred(
  session: SupabaseClient,
  roundId: string,
  memberId: string,
  preferred: boolean,
): Promise<SchedulingResult> {
  const { error } = await session.rpc("set_preferred", { p_round_id: roundId, p_member_id: memberId, p_preferred: preferred });
  if (error?.code === "42501") return NOT_ALLOWED;
  return error ? { error: error.message } : { ok: true };
}

/** Database errors from the slot rules as messages for the admin. */
async function translate(session: SupabaseClient, error: { code?: string; hint?: string; details?: string; message: string }) {
  if (error.code === "23P01") return "Am Ort gibt es zu dieser Zeit schon einen Termin (Puffer eingeschlossen).";
  if (error.hint === "person_overlap") {
    const { data } = await session.from("team_members").select("name").eq("id", error.details ?? "").maybeSingle<{ name: string }>();
    return `${data?.name ?? "Ein Gesprächsführer"} sitzt zu dieser Zeit schon in einem anderen Gespräch (Puffer eingeschlossen).`;
  }
  if (error.code === "23514" && error.message.includes("slots_booked_has_pair")) {
    return "Ein gebuchter Termin braucht zwei Gesprächsführer.";
  }
  if (error.code === "42501") return NOT_ALLOWED.error;
  return `Speichern fehlgeschlagen: ${error.message}`;
}
