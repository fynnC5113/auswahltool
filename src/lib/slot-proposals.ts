// Slot proposals (TECH_DESIGN 6.2). Pure function, no database.
//
// A slot occupies its location for interview + buffer, so nothing else can
// be booked into the buffer. Interviewers only need to be available for the
// interview itself, but while they sit in a slot (buffer included) they get
// no other one. Greedy: pick the candidate whose pair is least loaded (the
// busier of the two counts, then the sum), then the earlier time, then the
// default location. A "preferred" member does not count as loaded and wins
// ties, so they get as many interviews as their availability and limit allow.
import { CELL_MINUTES } from "@/lib/availability-grid";

const MINUTE = 60 * 1000;
const CELL_MS = CELL_MINUTES * MINUTE;

export type ProposalMember = {
  id: string;
  /** Starts of the member's 15-minute cells (ISO). */
  cells: string[];
  /** null = no limit. Counts existing slots too. */
  maxInterviews: number | null;
  preferred?: boolean;
};

export type ProposalSlot = {
  locationId: string;
  startsAt: string;
  interviewEndsAt: string;
  /** Interview + buffer. */
  endsAt: string;
  interviewerA: string;
  interviewerB: string;
};

export type ProposalInput = {
  members: ProposalMember[];
  /** In order of preference; the default location should come first. */
  locations: { id: string }[];
  blocked: { locationId: string; startsAt: string; endsAt: string }[];
  existing: ProposalSlot[];
  interviewMinutes: number;
  bufferMinutes: number;
  needed: number;
};

export type ProposalResult = { slots: ProposalSlot[]; missing: number };

type Interval = { start: number; end: number };

const overlaps = (list: Interval[], start: number, end: number) => list.some((i) => i.start < end && i.end > start);

function push<K>(map: Map<K, Interval[]>, key: K, interval: Interval) {
  const list = map.get(key);
  if (list) list.push(interval);
  else map.set(key, [interval]);
}

export function proposeSlots(input: ProposalInput): ProposalResult {
  const interviewMs = input.interviewMinutes * MINUTE;
  const totalMs = interviewMs + input.bufferMinutes * MINUTE;
  const cellsNeeded = Math.ceil(interviewMs / CELL_MS);

  const members = input.members.map((m) => ({
    ...m,
    cellSet: new Set(m.cells.map((c) => Date.parse(c))),
    count: 0,
  }));
  const byId = new Map(members.map((m) => [m.id, m]));

  // Occupied intervals per location (blocked times and slots) and per person.
  const locationBusy = new Map<string, Interval[]>();
  const personBusy = new Map<string, Interval[]>();
  for (const b of input.blocked) push(locationBusy, b.locationId, { start: Date.parse(b.startsAt), end: Date.parse(b.endsAt) });
  const occupy = (slot: ProposalSlot) => {
    const interval = { start: Date.parse(slot.startsAt), end: Date.parse(slot.endsAt) };
    push(locationBusy, slot.locationId, interval);
    for (const id of [slot.interviewerA, slot.interviewerB]) {
      push(personBusy, id, interval);
      const member = byId.get(id);
      if (member) member.count++;
    }
  };
  input.existing.forEach(occupy);

  const starts = [...new Set(members.flatMap((m) => [...m.cellSet]))].sort((a, b) => a - b);
  const availableAt = (m: (typeof members)[number], start: number) => {
    for (let i = 0; i < cellsNeeded; i++) if (!m.cellSet.has(start + i * CELL_MS)) return false;
    return true;
  };
  // Who could interview at each start at all; fixed for the whole run.
  const candidatesAt = starts.map((start) => members.filter((m) => availableAt(m, start)));

  const load = (m: (typeof members)[number]) => (m.preferred ? 0 : m.count);
  const slots: ProposalSlot[] = [];

  while (slots.length < input.needed) {
    let best: { key: number[]; slot: ProposalSlot } | null = null;

    for (let startIndex = 0; startIndex < starts.length; startIndex++) {
      const start = starts[startIndex];
      const end = start + totalMs;
      const location = input.locations.findIndex((l) => !overlaps(locationBusy.get(l.id) ?? [], start, end));
      if (location < 0) continue;
      const free = candidatesAt[startIndex].filter(
        (m) => (m.maxInterviews === null || m.count < m.maxInterviews) && !overlaps(personBusy.get(m.id) ?? [], start, end),
      );

      for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
          const a = free[i];
          const b = free[j];
          const key = [
            Math.max(load(a), load(b)),
            a.preferred || b.preferred ? 0 : 1,
            load(a) + load(b),
            start,
            location,
            i,
            j,
          ];
          if (best && !isLess(key, best.key)) continue;
          best = {
            key,
            slot: {
              locationId: input.locations[location].id,
              startsAt: new Date(start).toISOString(),
              interviewEndsAt: new Date(start + interviewMs).toISOString(),
              endsAt: new Date(end).toISOString(),
              interviewerA: a.id,
              interviewerB: b.id,
            },
          };
        }
      }
    }

    if (!best) break;
    slots.push(best.slot);
    occupy(best.slot);
  }

  return { slots, missing: Math.max(0, input.needed - slots.length) };
}

function isLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
