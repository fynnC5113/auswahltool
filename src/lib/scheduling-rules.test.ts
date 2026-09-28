import { describe, expect, it } from "vitest";
import { capacity, hintText, isBookable, slotHints, type HintContext, type HintMember, type PlannedSlot } from "./scheduling-rules";

const at = (time: string) => new Date(`2026-10-20T${time}:00+02:00`).toISOString();
const cells = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => new Date(Date.parse(at(from)) + i * 15 * 60_000).toISOString());

const slot = (extra: Partial<PlannedSlot> = {}): PlannedSlot => ({
  id: "s1",
  locationId: "room",
  startsAt: at("10:00"),
  interviewEndsAt: at("10:30"),
  endsAt: at("10:45"),
  interviewerA: "a",
  interviewerB: "b",
  status: "confirmed",
  applicantId: null,
  ...extra,
});

const member = (id: string, extra: Partial<HintMember> = {}): HintMember => ({
  id,
  name: id.toUpperCase(),
  active: true,
  cells: cells("10:00", 2),
  maxInterviews: null,
  ...extra,
});

const context = (extra: Partial<HintContext> = {}): HintContext => ({
  members: [member("a"), member("b")],
  slots: [slot()],
  conflicts: [],
  blocked: [],
  ...extra,
});

const open = (id: string, extra: Partial<PlannedSlot> = {}) => slot({ id, interviewerA: null, interviewerB: null, ...extra });

describe("isBookable and capacity", () => {
  it("a free slot without a pair is bookable while a pair can be found", () => {
    expect(isBookable(open("o"), context({ slots: [open("o")] }))).toBe(true);
    expect(isBookable(open("o"), context({ slots: [open("o")], members: [member("a")] }))).toBe(false);
    // Deactivated members do not count.
    expect(isBookable(open("o"), context({ slots: [open("o")], members: [member("a"), member("b", { active: false })] }))).toBe(false);
  });

  it("a slot with a pair elsewhere at the same time takes the people away", () => {
    const fixed = slot({ id: "f", locationId: "other" });
    expect(isBookable(open("o"), context({ slots: [fixed, open("o")] }))).toBe(false);
  });

  it("booked slots are not bookable; a fixed free pair is", () => {
    expect(isBookable(slot({ applicantId: "x" }), context())).toBe(false);
    expect(isBookable(slot(), context())).toBe(true);
  });

  it("counts applications without a slot and bookable free slots", () => {
    const slots = [slot({ applicantId: "x" }), open("o1", { startsAt: at("11:00"), interviewEndsAt: at("11:30"), endsAt: at("11:45") }), open("o2")];
    // o1 lies outside everyone's availability, o2 overlaps the booked pair.
    expect(capacity(5, context({ slots }))).toEqual({ applications: 5, booked: 1, withoutSlot: 4, free: 2, bookable: 0 });
    const more = context({ slots, members: [member("a"), member("b"), member("c"), member("d")] });
    expect(capacity(5, more)).toMatchObject({ free: 2, bookable: 1 });
  });

  it("withoutSlot never below 0", () => {
    expect(capacity(0, context({ slots: [slot({ applicantId: "x" })] })).withoutSlot).toBe(0);
  });
});

describe("slotHints", () => {
  it("no hints for an available, active pair", () => {
    expect(slotHints(slot(), context())).toEqual([]);
  });

  it("deactivated or unknown interviewer", () => {
    const hints = slotHints(slot({ applicantId: "x" }), context({ members: [member("a", { active: false })] }));
    expect(hints).toEqual([
      { kind: "inactive", memberId: "a" },
      { kind: "inactive", memberId: "b" },
    ]);
  });

  it("conflict only with the booked applicant", () => {
    const conflicts = [{ applicantId: "x", memberId: "b" }];
    expect(slotHints(slot(), context({ conflicts }))).toEqual([]);
    expect(slotHints(slot({ applicantId: "x" }), context({ conflicts }))).toEqual([{ kind: "conflict", memberId: "b" }]);
  });

  it("unavailable if one cell of the interview is missing; the buffer does not count", () => {
    const hints = slotHints(slot(), context({ members: [member("a", { cells: cells("10:00", 1) }), member("b")] }));
    expect(hints).toEqual([{ kind: "unavailable", memberId: "a" }]);
  });

  it("a start off the grid needs the cell it starts in", () => {
    const off = slot({ startsAt: at("10:05"), interviewEndsAt: at("10:35"), endsAt: at("10:50") });
    expect(slotHints(off, context({ slots: [off] }))).toEqual([
      { kind: "unavailable", memberId: "a" },
      { kind: "unavailable", memberId: "b" },
    ]);
    const covered = context({ slots: [off], members: [member("a", { cells: cells("10:00", 3) }), member("b", { cells: cells("10:00", 3) })] });
    expect(slotHints(off, covered)).toEqual([]);
  });

  it("over the limit counts booked interviews only", () => {
    const members = [member("a", { maxInterviews: 1 }), member("b", { maxInterviews: 1 })];
    const twoBooked = [slot({ applicantId: "x" }), slot({ id: "s2", interviewerB: "c", applicantId: "y" })];
    expect(slotHints(twoBooked[0], context({ slots: twoBooked, members }))).toEqual([{ kind: "over_limit", memberId: "a" }]);
    const oneBooked = [slot({ applicantId: "x" }), slot({ id: "s2", interviewerB: "c" })];
    expect(slotHints(oneBooked[0], context({ slots: oneBooked, members }))).toEqual([]);
  });

  it("blocked time at the slot's location, buffer included", () => {
    const inBuffer = [{ locationId: "room", startsAt: at("10:40"), endsAt: at("11:00") }];
    const touching = [{ locationId: "room", startsAt: at("10:45"), endsAt: at("11:00") }];
    const elsewhere = [{ locationId: "other", startsAt: at("10:00"), endsAt: at("11:00") }];
    expect(slotHints(slot(), context({ blocked: inBuffer }))).toEqual([{ kind: "blocked" }]);
    expect(slotHints(slot(), context({ blocked: touching }))).toEqual([]);
    expect(slotHints(slot(), context({ blocked: elsewhere }))).toEqual([]);
  });

  it("a free slot without a pair only gets a hint when no pair is left", () => {
    expect(slotHints(open("o"), context({ slots: [open("o")] }))).toEqual([]);
    expect(slotHints(open("o"), context({ slots: [open("o")], members: [member("a")] }))).toEqual([{ kind: "no_pair" }]);
  });

  it("texts name the member", () => {
    expect(hintText({ kind: "conflict", memberId: "a" }, (id) => `Name ${id}`)).toBe(
      "Name a ist bei diesem Bewerber befangen. Bitte neu besetzen.",
    );
  });
});
