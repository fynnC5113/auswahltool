// Offered slots and pair choice (Fynn, 29.09.2026). Pure functions, no database.
//
// The tool offers every time at which a pair could interview, as time +
// location without a pair. The pair is chosen when an applicant books
// (choosePair), so the booked interviews spread evenly over the team.
//
// A slot occupies its location for interview + buffer. Interviewers only need
// to be available for the interview itself, but while they sit in a slot
// (buffer included) they get no other one. Limits count booked interviews
// only; a limit of 0 means the member takes no interviews at all.
import { CELL_MINUTES } from "@/lib/availability-grid";

const MINUTE = 60 * 1000;
const CELL_MS = CELL_MINUTES * MINUTE;

export type OfferMember = {
  id: string;
  /** Starts of the member's 15-minute cells (ISO). */
  cells: string[];
  /** null = no limit. Counts booked interviews. */
  maxInterviews: number | null;
  preferred?: boolean;
};

export type ExistingSlot = {
  locationId: string;
  startsAt: string;
  endsAt: string;
  /** null = no pair yet. */
  interviewerA: string | null;
  interviewerB: string | null;
  applicantId: string | null;
};

export type OfferedSlot = { locationId: string; startsAt: string; interviewEndsAt: string; endsAt: string };

export type OfferInput = {
  /** Active members only; the caller leaves out deactivated ones. */
  members: OfferMember[];
  /** In order of preference; the default location first. */
  locations: { id: string }[];
  blocked: { locationId: string; startsAt: string; endsAt: string }[];
  existing: ExistingSlot[];
  interviewMinutes: number;
  bufferMinutes: number;
};

type Interval = { start: number; end: number };

const overlaps = (list: Interval[], start: number, end: number) => list.some((i) => i.start < end && i.end > start);
const interval = (s: { startsAt: string; endsAt: string }): Interval => ({ start: Date.parse(s.startsAt), end: Date.parse(s.endsAt) });

function push<K>(map: Map<K, Interval[]>, key: K, value: Interval) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Does the member's availability cover every cell of [start, end)? */
function covers(cells: Set<number>, start: number, end: number): boolean {
  for (let t = Math.floor(start / CELL_MS) * CELL_MS; t < end; t += CELL_MS) if (!cells.has(t)) return false;
  return true;
}

/** Per person: the intervals of all slots that have a pair (booked or fixed). */
function busyByPerson(slots: ExistingSlot[]): Map<string, Interval[]> {
  const busy = new Map<string, Interval[]>();
  for (const s of slots) {
    if (!s.interviewerA || !s.interviewerB) continue;
    push(busy, s.interviewerA, interval(s));
    push(busy, s.interviewerB, interval(s));
  }
  return busy;
}

/**
 * Every slot that can be added: per location (in order), back to back from
 * the earliest start, wherever the location is free and enough people are
 * available. A time only gets a second location if there are people for
 * another pair next to every pairless slot already overlapping it.
 */
export function offerTimes(input: OfferInput): OfferedSlot[] {
  const interviewMs = input.interviewMinutes * MINUTE;
  const totalMs = interviewMs + input.bufferMinutes * MINUTE;
  const members = input.members
    .filter((m) => m.maxInterviews !== 0)
    .map((m) => ({ id: m.id, cells: new Set(m.cells.map((c) => Date.parse(c))) }));

  const locationBusy = new Map<string, Interval[]>();
  for (const b of input.blocked) push(locationBusy, b.locationId, interval(b));
  for (const s of input.existing) push(locationBusy, s.locationId, interval(s));
  const personBusy = busyByPerson(input.existing);
  // Slots still waiting for a pair compete for the same people.
  const open: Interval[] = input.existing.filter((s) => !s.interviewerA).map(interval);

  const starts = [...new Set(members.flatMap((m) => [...m.cells]))].sort((a, b) => a - b);
  const offered: OfferedSlot[] = [];

  for (const location of input.locations) {
    for (const start of starts) {
      const end = start + totalMs;
      if (overlaps(locationBusy.get(location.id) ?? [], start, end)) continue;
      const people = members.filter(
        (m) => covers(m.cells, start, start + interviewMs) && !overlaps(personBusy.get(m.id) ?? [], start, end),
      ).length;
      const competing = open.filter((i) => i.start < end && i.end > start).length;
      if (people < 2 * (competing + 1)) continue;

      offered.push({
        locationId: location.id,
        startsAt: new Date(start).toISOString(),
        interviewEndsAt: new Date(start + interviewMs).toISOString(),
        endsAt: new Date(end).toISOString(),
      });
      push(locationBusy, location.id, { start, end });
      open.push({ start, end });
    }
  }
  return offered.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || input.locations.findIndex((l) => l.id === a.locationId) - input.locations.findIndex((l) => l.id === b.locationId));
}

export type PairInput = {
  slot: { startsAt: string; interviewEndsAt: string; endsAt: string };
  /** Active members only, in a fixed order (ties go to the earlier one). */
  members: OfferMember[];
  /** Every other slot of the round. */
  slots: ExistingSlot[];
  /** Members who may not take this applicant (conflict of interest). */
  excluded?: string[];
};

/**
 * The pair for a booking: available for the interview, free until the buffer
 * ends, under their limit, not excluded. Least loaded first: the busier of
 * the two, then (tie) a pair with a preferred member, then the sum. Load =
 * booked interviews; a preferred member counts as unloaded. null = no pair.
 */
export function choosePair(input: PairInput): { interviewerA: string; interviewerB: string } | null {
  const start = Date.parse(input.slot.startsAt);
  const interviewEnd = Date.parse(input.slot.interviewEndsAt);
  const end = Date.parse(input.slot.endsAt);
  const excluded = new Set(input.excluded ?? []);
  const personBusy = busyByPerson(input.slots);

  const booked = new Map<string, number>();
  for (const s of input.slots) {
    if (!s.applicantId) continue;
    for (const id of [s.interviewerA, s.interviewerB]) if (id) booked.set(id, (booked.get(id) ?? 0) + 1);
  }

  const free = input.members
    .map((m) => ({ ...m, count: booked.get(m.id) ?? 0, cellSet: new Set(m.cells.map((c) => Date.parse(c))) }))
    .filter(
      (m) =>
        !excluded.has(m.id) &&
        (m.maxInterviews === null || m.count < m.maxInterviews) &&
        covers(m.cellSet, start, interviewEnd) &&
        !overlaps(personBusy.get(m.id) ?? [], start, end),
    );
  const load = (m: (typeof free)[number]) => (m.preferred ? 0 : m.count);

  let best: { key: number[]; a: string; b: string } | null = null;
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i];
      const b = free[j];
      const key = [Math.max(load(a), load(b)), a.preferred || b.preferred ? 0 : 1, load(a) + load(b), i, j];
      if (!best || isLess(key, best.key)) best = { key, a: a.id, b: b.id };
    }
  }
  return best && { interviewerA: best.a, interviewerB: best.b };
}

function isLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
