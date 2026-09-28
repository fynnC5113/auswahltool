import { describe, expect, it } from "vitest";
import { dayCells } from "./availability-grid";
import { proposeSlots, type ProposalInput, type ProposalMember, type ProposalSlot } from "./slot-proposals";

/** Cell starts of a day from "from" up to (excluding) "until", Berlin time. */
function cells(day: string, from: string, until: string): string[] {
  return dayCells(day)
    .filter((c) => c.label >= from && c.label < until)
    .map((c) => c.start);
}

const member = (id: string, cellStarts: string[], extra: Partial<ProposalMember> = {}): ProposalMember => ({
  id,
  cells: cellStarts,
  maxInterviews: null,
  ...extra,
});

function input(extra: Partial<ProposalInput>): ProposalInput {
  return {
    members: [],
    locations: [{ id: "0.23" }],
    blocked: [],
    existing: [],
    interviewMinutes: 30,
    bufferMinutes: 15,
    needed: 1,
    ...extra,
  };
}

const ms = (iso: string) => Date.parse(iso);
const overlap = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) =>
  ms(a.startsAt) < ms(b.endsAt) && ms(a.endsAt) > ms(b.startsAt);

/** Every rule of TECH_DESIGN 6.2 at once, for any result. */
function expectValid(data: ProposalInput, slots: ProposalSlot[]) {
  const all = [...data.existing, ...slots];
  for (const slot of slots) {
    expect(ms(slot.interviewEndsAt) - ms(slot.startsAt)).toBe(data.interviewMinutes * 60000);
    expect(ms(slot.endsAt) - ms(slot.interviewEndsAt)).toBe(data.bufferMinutes * 60000);
    expect(slot.interviewerA).not.toBe(slot.interviewerB);
    for (const b of data.blocked.filter((b) => b.locationId === slot.locationId)) expect(overlap(slot, b)).toBe(false);
    for (const other of all) {
      if (other === slot) continue;
      if (other.locationId === slot.locationId) expect(overlap(slot, other)).toBe(false);
      const shared = [other.interviewerA, other.interviewerB].some((id) => id === slot.interviewerA || id === slot.interviewerB);
      if (shared) expect(overlap(slot, other)).toBe(false);
    }
    for (const id of [slot.interviewerA, slot.interviewerB]) {
      const available = new Set(data.members.find((m) => m.id === id)!.cells);
      for (let t = ms(slot.startsAt); t < ms(slot.interviewEndsAt); t += 15 * 60000) {
        expect(available.has(new Date(t).toISOString())).toBe(true);
      }
    }
  }
  for (const m of data.members) {
    if (m.maxInterviews === null) continue;
    expect(all.filter((s) => s.interviewerA === m.id || s.interviewerB === m.id).length).toBeLessThanOrEqual(m.maxInterviews);
  }
}

function countPerMember(slots: ProposalSlot[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of slots) for (const id of [s.interviewerA, s.interviewerB]) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

const morning = cells("2026-10-20", "08:00", "12:00");

describe("proposeSlots", () => {
  it("no availability gives no slots and reports everything as missing", () => {
    expect(proposeSlots(input({ members: [member("a", []), member("b", [])], needed: 3 }))).toEqual({ slots: [], missing: 3 });
  });

  it("one person alone is not enough for a slot", () => {
    expect(proposeSlots(input({ members: [member("a", morning)], needed: 1 }))).toEqual({ slots: [], missing: 1 });
  });

  it("two people available 08:00–09:00 get one slot at 08:00 with buffer", () => {
    const data = input({ members: [member("a", cells("2026-10-20", "08:00", "09:00")), member("b", cells("2026-10-20", "08:00", "09:00"))] });
    expect(proposeSlots(data)).toEqual({
      slots: [
        {
          locationId: "0.23",
          startsAt: "2026-10-20T06:00:00.000Z",
          interviewEndsAt: "2026-10-20T06:30:00.000Z",
          endsAt: "2026-10-20T06:45:00.000Z",
          interviewerA: "a",
          interviewerB: "b",
        },
      ],
      missing: 0,
    });
  });

  it("interviewers need the interview time only, not the buffer", () => {
    const halfHour = cells("2026-10-20", "08:00", "08:30");
    const { slots } = proposeSlots(input({ members: [member("a", halfHour), member("b", halfHour)] }));
    expect(slots).toHaveLength(1);
  });

  it("nobody is booked into the buffer: the next slot at the location starts after it", () => {
    const data = input({ members: ["a", "b", "c", "d"].map((id) => member(id, morning)), needed: 2 });
    const { slots } = proposeSlots(data);
    expectValid(data, slots);
    expect(slots.map((s) => s.startsAt)).toEqual(["2026-10-20T06:00:00.000Z", "2026-10-20T06:45:00.000Z"]);
  });

  it("an interview plus buffer that is not a multiple of 15 minutes (30 + 10)", () => {
    const data = input({ members: ["a", "b", "c", "d"].map((id) => member(id, morning)), bufferMinutes: 10, needed: 3 });
    const { slots } = proposeSlots(data);
    expectValid(data, slots);
    // 08:00–08:40 occupies the location; the next grid start is 08:45.
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-10-20T06:00:00.000Z",
      "2026-10-20T06:45:00.000Z",
      "2026-10-20T07:30:00.000Z",
    ]);
  });

  it("respects blocked times", () => {
    const data = input({
      members: ["a", "b"].map((id) => member(id, morning)),
      blocked: [{ locationId: "0.23", startsAt: "2026-10-20T06:00:00.000Z", endsAt: "2026-10-20T08:00:00.000Z" }],
      needed: 5,
    });
    const { slots, missing } = proposeSlots(data);
    expectValid(data, slots);
    // 08:00–10:00 is blocked; 10:00, 10:45 and 11:30 remain (the interview ends at 12:00).
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-10-20T08:00:00.000Z",
      "2026-10-20T08:45:00.000Z",
      "2026-10-20T09:30:00.000Z",
    ]);
    expect(slots.every((s) => ms(s.startsAt) >= ms("2026-10-20T08:00:00.000Z"))).toBe(true);
    expect(slots.length + missing).toBe(5);
  });

  it("uses a second location while the default one is blocked", () => {
    const data = input({
      members: ["a", "b"].map((id) => member(id, morning)),
      locations: [{ id: "0.23" }, { id: "Raum B" }],
      blocked: [{ locationId: "0.23", startsAt: "2026-10-20T06:00:00.000Z", endsAt: "2026-10-20T07:00:00.000Z" }],
    });
    expect(proposeSlots(data).slots[0]).toMatchObject({ locationId: "Raum B", startsAt: "2026-10-20T06:00:00.000Z" });
  });

  it("prefers the default location when both are free", () => {
    const data = input({ members: ["a", "b"].map((id) => member(id, morning)), locations: [{ id: "0.23" }, { id: "Raum B" }] });
    expect(proposeSlots(data).slots[0].locationId).toBe("0.23");
  });

  it("respects limits, counting existing slots", () => {
    const existing: ProposalSlot = {
      locationId: "0.23",
      startsAt: "2026-10-21T06:00:00.000Z",
      interviewEndsAt: "2026-10-21T06:30:00.000Z",
      endsAt: "2026-10-21T06:45:00.000Z",
      interviewerA: "a",
      interviewerB: "b",
    };
    const data = input({
      members: [member("a", morning, { maxInterviews: 2 }), member("b", morning, { maxInterviews: 1 }), member("c", morning)],
      existing: [existing],
      needed: 4,
    });
    const { slots, missing } = proposeSlots(data);
    expectValid(data, slots);
    expect(slots).toHaveLength(1); // a has one left, b none, c cannot pair alone
    expect(missing).toBe(3);
    expect(countPerMember(slots)).toEqual({ a: 1, c: 1 });
  });

  it("does not place a person in two overlapping slots at different locations", () => {
    const data = input({
      members: ["a", "b", "c"].map((id) => member(id, cells("2026-10-20", "08:00", "08:30"))),
      locations: [{ id: "0.23" }, { id: "Raum B" }],
      needed: 2,
    });
    const { slots, missing } = proposeSlots(data);
    expectValid(data, slots);
    expect(slots).toHaveLength(1);
    expect(missing).toBe(1);
  });

  it("existing slots block their location and their interviewers", () => {
    const existing: ProposalSlot = {
      locationId: "0.23",
      startsAt: "2026-10-20T06:00:00.000Z",
      interviewEndsAt: "2026-10-20T06:30:00.000Z",
      endsAt: "2026-10-20T06:45:00.000Z",
      interviewerA: "x",
      interviewerB: "y",
    };
    const data = input({ members: ["a", "b"].map((id) => member(id, morning)), existing: [existing] });
    expect(proposeSlots(data).slots[0].startsAt).toBe("2026-10-20T06:45:00.000Z");
  });

  it("distributes interviews evenly", () => {
    const data = input({
      members: ["a", "b", "c", "d", "e", "f"].map((id) => member(id, cells("2026-10-20", "08:00", "20:00"))),
      locations: [{ id: "0.23" }, { id: "Raum B" }],
      needed: 9,
    });
    const { slots, missing } = proposeSlots(data);
    expectValid(data, slots);
    expect(missing).toBe(0);
    expect(Object.values(countPerMember(slots))).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it("evens out a member who already has interviews", () => {
    const existing: ProposalSlot[] = [0, 1].map((i) => ({
      locationId: "0.23",
      startsAt: `2026-10-21T0${6 + i}:00:00.000Z`,
      interviewEndsAt: `2026-10-21T0${6 + i}:30:00.000Z`,
      endsAt: `2026-10-21T0${6 + i}:45:00.000Z`,
      interviewerA: "a",
      interviewerB: "b",
    }));
    const data = input({ members: ["a", "b", "c", "d"].map((id) => member(id, morning)), existing, needed: 2 });
    const { slots } = proposeSlots(data);
    expect(countPerMember(slots)).toEqual({ c: 2, d: 2 });
  });

  it("a preferred member gets as many interviews as possible; the others share the rest evenly", () => {
    const allDay = cells("2026-10-20", "08:00", "20:00");
    const data = input({
      members: [member("fynn", allDay, { preferred: true }), ...["b", "c", "d", "e"].map((id) => member(id, allDay))],
      locations: [{ id: "0.23" }, { id: "Raum B" }],
      needed: 12,
    });
    const { slots, missing } = proposeSlots(data);
    expectValid(data, slots);
    expect(missing).toBe(0);
    const counts = countPerMember(slots);
    expect(counts.fynn).toBe(12);
    expect([counts.b, counts.c, counts.d, counts.e]).toEqual([3, 3, 3, 3]);
  });

  it("a preferred member still respects availability and limit", () => {
    const data = input({
      members: [
        member("fynn", cells("2026-10-20", "08:00", "10:00"), { preferred: true, maxInterviews: 1 }),
        ...["b", "c"].map((id) => member(id, morning)),
      ],
      needed: 4,
    });
    const { slots } = proposeSlots(data);
    expectValid(data, slots);
    expect(countPerMember(slots).fynn).toBe(1);
  });

  it("uses winter time after 25.10.2026 (08:00 Berlin = 07:00 UTC)", () => {
    const day = cells("2026-10-26", "08:00", "09:00");
    const { slots } = proposeSlots(input({ members: [member("a", day), member("b", day)] }));
    expect(slots[0].startsAt).toBe("2026-10-26T07:00:00.000Z");
  });

  it("30 applicants and 12 members over 12 days take less than 1 second", () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(20 + i).padStart(2, "0")}`);
    const members = Array.from({ length: 12 }, (_, i) =>
      member(
        `m${i}`,
        days.flatMap((day, d) => ((d + i) % 3 === 0 ? [] : cells(day, i % 2 ? "08:00" : "13:00", i % 2 ? "14:00" : "20:00"))),
        { maxInterviews: i % 4 === 0 ? 4 : null },
      ),
    );
    const data = input({
      members,
      locations: [{ id: "0.23" }, { id: "Raum B" }],
      blocked: days.map((day) => ({ locationId: "0.23", startsAt: `${day}T08:00:00.000Z`, endsAt: `${day}T10:00:00.000Z` })),
      needed: 30,
    });
    const started = performance.now();
    const { slots, missing } = proposeSlots(data);
    const elapsed = performance.now() - started;
    expectValid(data, slots);
    expect(missing).toBe(0);
    expect(elapsed).toBeLessThan(1000);
  });
});
