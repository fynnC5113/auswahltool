// Capacity and slot hints for /terminplanung. Pure functions, no database.
// Hints never block saving: overlaps are rejected by the database, everything
// else (deactivated, conflicted, unavailable, over the limit, blocked time,
// no pair left) is shown to the admin, who decides.
import { CELL_MINUTES } from "@/lib/availability-grid";
import { choosePair, type OfferMember } from "@/lib/slot-offers";

const CELL_MS = CELL_MINUTES * 60 * 1000;

export type SlotStatus = "proposed" | "confirmed";

export type PlannedSlot = {
  id: string;
  locationId: string;
  startsAt: string;
  interviewEndsAt: string;
  endsAt: string;
  /** null until booked or fixed by an admin. */
  interviewerA: string | null;
  interviewerB: string | null;
  status: SlotStatus;
  applicantId: string | null;
};

export type HintMember = OfferMember & { name: string; active: boolean };

export type HintContext = {
  /** Active members plus anyone who sits in a slot. */
  members: HintMember[];
  /** Every slot of the round. */
  slots: PlannedSlot[];
  conflicts: { applicantId: string; memberId: string }[];
  blocked: { locationId: string; startsAt: string; endsAt: string }[];
};

/** A free slot is bookable if it has a pair or one can still be found. */
export function isBookable(slot: PlannedSlot, context: HintContext): boolean {
  if (slot.applicantId) return false;
  if (slot.interviewerA) return true;
  return (
    choosePair({
      slot,
      members: context.members.filter((m) => m.active),
      slots: context.slots.filter((s) => s.id !== slot.id),
    }) !== null
  );
}

export type Capacity = {
  applications: number;
  booked: number;
  /** Applications minus booked slots. */
  withoutSlot: number;
  free: number;
  /** Free slots that can be booked right now. */
  bookable: number;
};

export function capacity(applications: number, context: HintContext): Capacity {
  const booked = context.slots.filter((s) => s.applicantId).length;
  return {
    applications,
    booked,
    withoutSlot: Math.max(0, applications - booked),
    free: context.slots.length - booked,
    bookable: context.slots.filter((s) => isBookable(s, context)).length,
  };
}

export type Hint =
  | { kind: "inactive" | "conflict" | "unavailable" | "over_limit"; memberId: string }
  | { kind: "blocked" | "no_pair" };

export function slotHints(slot: PlannedSlot, context: HintContext): Hint[] {
  const hints: Hint[] = [];
  const start = Date.parse(slot.startsAt);
  const interviewEnd = Date.parse(slot.interviewEndsAt);
  const end = Date.parse(slot.endsAt);

  for (const memberId of slot.interviewerA && slot.interviewerB ? [slot.interviewerA, slot.interviewerB] : []) {
    const member = context.members.find((m) => m.id === memberId);
    if (!member || !member.active) {
      hints.push({ kind: "inactive", memberId });
      continue;
    }
    if (slot.applicantId && context.conflicts.some((c) => c.applicantId === slot.applicantId && c.memberId === memberId)) {
      hints.push({ kind: "conflict", memberId });
    }
    if (!availableFor(member.cells, start, interviewEnd)) hints.push({ kind: "unavailable", memberId });
    // The limit counts booked interviews.
    const booked = context.slots.filter((s) => s.applicantId && (s.interviewerA === memberId || s.interviewerB === memberId)).length;
    if (member.maxInterviews !== null && booked > member.maxInterviews) hints.push({ kind: "over_limit", memberId });
  }

  const blocked = context.blocked.some(
    (b) => b.locationId === slot.locationId && Date.parse(b.startsAt) < end && Date.parse(b.endsAt) > start,
  );
  if (blocked) hints.push({ kind: "blocked" });
  if (!slot.applicantId && !isBookable(slot, context)) hints.push({ kind: "no_pair" });
  return hints;
}

/** Every 15-minute cell the interview touches must be one of the member's cells. */
function availableFor(cells: string[], start: number, end: number): boolean {
  const set = new Set(cells.map((c) => Date.parse(c)));
  for (let t = Math.floor(start / CELL_MS) * CELL_MS; t < end; t += CELL_MS) if (!set.has(t)) return false;
  return true;
}

export function hintText(hint: Hint, nameOf: (id: string) => string): string {
  switch (hint.kind) {
    case "inactive":
      return `${nameOf(hint.memberId)} ist deaktiviert. Bitte neu besetzen.`;
    case "conflict":
      return `${nameOf(hint.memberId)} ist bei diesem Bewerber befangen. Bitte neu besetzen.`;
    case "unavailable":
      return `${nameOf(hint.memberId)} hat sich zu dieser Zeit nicht als verfügbar eingetragen.`;
    case "over_limit":
      return `${nameOf(hint.memberId)} ist über der eigenen Obergrenze.`;
    case "blocked":
      return "Der Ort ist zu dieser Zeit gesperrt.";
    case "no_pair":
      return "Derzeit ist kein Paar frei. Der Termin ist nicht buchbar.";
  }
}
