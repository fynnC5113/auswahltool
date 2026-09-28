import { describe, expect, it } from "vitest";
import { dayCells } from "./availability-grid";
import { choosePair, offerTimes, type ExistingSlot, type OfferInput, type OfferMember } from "./slot-offers";

const at = (time: string, day = "2026-10-20") => new Date(`${day}T${time}:00+02:00`).toISOString();
/** Cells from `from` (inclusive) to `to` (exclusive). */
function cells(from: string, to: string, day = "2026-10-20"): string[] {
  const list: string[] = [];
  for (let t = Date.parse(at(from, day)); t < Date.parse(at(to, day)); t += 15 * 60_000) list.push(new Date(t).toISOString());
  return list;
}
const member = (id: string, from = "10:00", to = "12:00", extra: Partial<OfferMember> = {}): OfferMember => ({
  id,
  cells: cells(from, to),
  maxInterviews: null,
  ...extra,
});
const input = (extra: Partial<OfferInput> = {}): OfferInput => ({
  members: [member("a"), member("b")],
  locations: [{ id: "room" }, { id: "second" }],
  blocked: [],
  existing: [],
  interviewMinutes: 30,
  bufferMinutes: 15,
  ...extra,
});
const times = (slots: { locationId: string; startsAt: string }[]) =>
  slots.map((s) => `${s.locationId} ${new Date(s.startsAt).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })}`);

describe("offerTimes", () => {
  it("no availability, no slots; one person is not a pair", () => {
    expect(offerTimes(input({ members: [] }))).toEqual([]);
    expect(offerTimes(input({ members: [member("a")] }))).toEqual([]);
  });

  it("back to back from the earliest start; only the interview needs availability", () => {
    // 10:00–12:00: 10:00, 10:45, 11:30 (interview until 12:00, buffer after).
    const slots = offerTimes(input());
    expect(times(slots)).toEqual(["room 10:00", "room 10:45", "room 11:30"]);
    expect(slots[0]).toEqual({
      locationId: "room",
      startsAt: at("10:00"),
      interviewEndsAt: at("10:30"),
      endsAt: at("10:45"),
    });
  });

  it("offered slots have no pair and ignore limits except 0", () => {
    expect(offerTimes(input({ members: [member("a", "10:00", "12:00", { maxInterviews: 1 }), member("b")] }))).toHaveLength(3);
    expect(offerTimes(input({ members: [member("a", "10:00", "12:00", { maxInterviews: 0 }), member("b")] }))).toEqual([]);
  });

  it("a second location only with people for a second pair", () => {
    expect(times(offerTimes(input({ members: [member("a"), member("b"), member("c")] })))).toEqual([
      "room 10:00",
      "room 10:45",
      "room 11:30",
    ]);
    const four = offerTimes(input({ members: [member("a"), member("b"), member("c"), member("d")] }));
    expect(times(four)).toEqual(["room 10:00", "second 10:00", "room 10:45", "second 10:45", "room 11:30", "second 11:30"]);
  });

  it("respects blocked times, buffer included", () => {
    const blocked = [{ locationId: "room", startsAt: at("10:40"), endsAt: at("11:00") }];
    // 10:00 would run into the blocked time with its buffer; 11:00 is the first start after it.
    expect(times(offerTimes(input({ blocked, locations: [{ id: "room" }] })))).toEqual(["room 11:00"]);
  });

  it("existing slots block their location, and their pair's time", () => {
    const existing: ExistingSlot[] = [
      { locationId: "room", startsAt: at("10:00"), endsAt: at("10:45"), interviewerA: "a", interviewerB: "b", applicantId: "x" },
    ];
    // Only a and b: busy until 10:45, so 10:45 and 11:30 at room; nothing at the second location at 10:00.
    expect(times(offerTimes(input({ existing })))).toEqual(["room 10:45", "room 11:30"]);
  });

  it("existing pairless slots compete for people", () => {
    const existing: ExistingSlot[] = [
      { locationId: "room", startsAt: at("10:00"), endsAt: at("10:45"), interviewerA: null, interviewerB: null, applicantId: null },
    ];
    // Two people: the free 10:00 slot needs them, so nothing parallel at the second location.
    expect(times(offerTimes(input({ existing })))).toEqual(["room 10:45", "room 11:30"]);
  });

  it("calling it again adds nothing new", () => {
    const first = offerTimes(input({ members: [member("a"), member("b"), member("c"), member("d")] }));
    const existing = first.map((s) => ({ ...s, interviewerA: null, interviewerB: null, applicantId: null }));
    expect(offerTimes(input({ members: [member("a"), member("b"), member("c"), member("d")], existing }))).toEqual([]);
  });

  it("winter time: cells on 26.10. are offered at the right Berlin time", () => {
    // The grid itself knows the offset; the at() helper above is summer time only.
    const winterCells = dayCells("2026-10-26").filter((c) => c.label >= "10:00" && c.label < "11:00").map((c) => c.start);
    const winter = (id: string) => ({ id, cells: winterCells, maxInterviews: null });
    const slots = offerTimes(input({ members: [winter("a"), winter("b")] }));
    expect(slots.map((s) => s.startsAt)).toEqual([new Date("2026-10-26T10:00:00+01:00").toISOString()]);
  });

  it("30 applicants' worth: 12 members over 12 days in well under a second", () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(20 + i).padStart(2, "0")}`);
    const members = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      cells: days.flatMap((d) => cells("08:00", "20:00", d)),
      maxInterviews: null,
    }));
    const started = performance.now();
    const slots = offerTimes(input({ members }));
    expect(performance.now() - started).toBeLessThan(1000);
    expect(slots.length).toBeGreaterThan(30);
  });
});

describe("choosePair", () => {
  const slot = { startsAt: at("10:00"), interviewEndsAt: at("10:30"), endsAt: at("10:45") };
  const booked = (a: string, b: string, time: string): ExistingSlot => ({
    locationId: "room",
    startsAt: at(time),
    endsAt: new Date(Date.parse(at(time)) + 45 * 60_000).toISOString(),
    interviewerA: a,
    interviewerB: b,
    applicantId: `app-${time}`,
  });
  const all = (from = "08:00", to = "12:00") => ["a", "b", "c", "d"].map((id) => member(id, from, to));

  it("no pair without two available people", () => {
    expect(choosePair({ slot, members: [member("a")], slots: [] })).toBeNull();
    expect(choosePair({ slot, members: [member("a"), member("b", "11:00", "12:00")], slots: [] })).toBeNull();
  });

  it("least loaded pair by booked interviews", () => {
    const slots = [booked("a", "b", "08:00"), booked("a", "c", "09:00")];
    expect(choosePair({ slot, members: all(), slots })).toEqual({ interviewerA: "b", interviewerB: "d" });
  });

  it("a slot with a pair but no applicant blocks the time, not the load", () => {
    const fixed = { ...booked("a", "b", "10:00"), locationId: "second", applicantId: null };
    expect(choosePair({ slot, members: all(), slots: [fixed] })).toEqual({ interviewerA: "c", interviewerB: "d" });
    expect(choosePair({ slot: { startsAt: at("11:00"), interviewEndsAt: at("11:30"), endsAt: at("11:45") }, members: all(), slots: [fixed] })).toEqual({
      interviewerA: "a",
      interviewerB: "b",
    });
  });

  it("someone still in a buffer is not free", () => {
    // a and b sit in 09:30–10:15 (buffer until 10:15).
    const slots = [booked("a", "b", "09:30")];
    expect(choosePair({ slot, members: all(), slots })).toEqual({ interviewerA: "c", interviewerB: "d" });
  });

  it("the limit counts booked interviews", () => {
    const members = [member("a", "08:00", "12:00", { maxInterviews: 1 }), member("b", "08:00", "12:00"), member("c", "08:00", "12:00")];
    const slots = [booked("a", "b", "08:00")];
    expect(choosePair({ slot, members, slots })).toEqual({ interviewerA: "b", interviewerB: "c" });
  });

  it("conflicted members are left out", () => {
    expect(choosePair({ slot, members: all(), slots: [], excluded: ["a", "b"] })).toEqual({ interviewerA: "c", interviewerB: "d" });
    expect(choosePair({ slot, members: all(), slots: [], excluded: ["a", "b", "c"] })).toBeNull();
  });

  it("a preferred member counts as unloaded and wins ties", () => {
    const members = all().map((m) => (m.id === "d" ? { ...m, preferred: true } : m));
    expect(choosePair({ slot, members, slots: [] })).toEqual({ interviewerA: "a", interviewerB: "d" });
    const slots = [booked("d", "a", "08:00"), booked("d", "b", "09:00")];
    expect(choosePair({ slot, members, slots })).toEqual({ interviewerA: "c", interviewerB: "d" });
  });

  it("spreads bookings evenly: 6 bookings over 4 members give each 3", () => {
    const members = ["a", "b", "c", "d"].map((id) => member(id, "08:00", "20:00"));
    const slots: ExistingSlot[] = [];
    for (let i = 0; i < 6; i++) {
      const start = at(`${String(8 + i).padStart(2, "0")}:00`);
      const s = { startsAt: start, interviewEndsAt: new Date(Date.parse(start) + 30 * 60_000).toISOString(), endsAt: new Date(Date.parse(start) + 45 * 60_000).toISOString() };
      const pair = choosePair({ slot: s, members, slots })!;
      slots.push({ locationId: "room", startsAt: s.startsAt, endsAt: s.endsAt, ...pair, applicantId: `x${i}` });
    }
    const counts = ["a", "b", "c", "d"].map((id) => slots.filter((s) => s.interviewerA === id || s.interviewerB === id).length);
    expect(counts).toEqual([3, 3, 3, 3]);
  });
});
