import { describe, expect, it } from "vitest";
import {
  ALL,
  NONE,
  alsoList,
  boardState,
  changeSeats,
  composition,
  formatShortScore,
  freeSeats,
  moveCard,
  shortScore,
  undoMove,
  type BoardState,
  type HistoryEntry,
  type Move,
  type MoveResult,
  type ScoreCriterion,
} from "./board-rules";

const ids = ["anna", "ben", "clara", "dora", "emil"];
const empty = () => boardState(ids, []);

function ok(r: MoveResult): { state: BoardState; move: Move } {
  if (!r.ok) throw new Error(`move failed: ${r.error}`);
  return r;
}

/** Applies moves in order and returns the state and the history. */
function play(state: BoardState, seats: number, steps: [string, Move["toZone"], number?][]) {
  const history: HistoryEntry[] = [];
  for (const [id, zone, position] of steps) {
    const r = ok(moveCard(state, seats, id, { zone, position }));
    state = r.state;
    history.push({ ...r.move, id: `e${history.length + 1}` });
  }
  return { state, history };
}

const at = (s: BoardState, id: string) => s.find((p) => p.applicantId === id);
const alsoNames = (s: BoardState) => alsoList(s).map((p) => `${p.position}:${p.applicantId}`);

describe("boardState", () => {
  it("puts applicants without a stored row into the pool and drops positions outside seats and also", () => {
    const s = boardState(["anna", "ben"], [{ applicantId: "ben", zone: "reject", position: 4 }]);
    expect(s).toEqual([
      { applicantId: "anna", zone: "pool", position: null },
      { applicantId: "ben", zone: "reject", position: null },
    ]);
  });
});

describe("seats are fixed boxes", () => {
  it("puts a card on the chosen seat and leaves the other seats free", () => {
    const { state } = play(empty(), 5, [["anna", "seat", 3]]);
    expect(at(state, "anna")).toEqual({ applicantId: "anna", zone: "seat", position: 3 });
    expect(freeSeats(state, 5)).toEqual([1, 2, 4, 5]);
  });

  it("keeps the other seat numbers when a card leaves (the seat stays empty)", () => {
    const { state } = play(empty(), 5, [
      ["anna", "seat", 1],
      ["ben", "seat", 2],
      ["clara", "seat", 3],
      ["ben", "pool"],
    ]);
    expect(at(state, "anna")?.position).toBe(1);
    expect(at(state, "clara")?.position).toBe(3);
    expect(freeSeats(state, 5)).toEqual([2, 4, 5]);
  });

  it("rejects a taken seat, also when all seats are full, and moves nothing", () => {
    const { state } = play(empty(), 2, [
      ["anna", "seat", 1],
      ["ben", "seat", 2],
    ]);
    expect(moveCard(state, 2, "clara", { zone: "seat", position: 1 })).toEqual({ ok: false, error: "seat_taken", position: 1 });
    expect(freeSeats(state, 2)).toEqual([]);
  });

  it("rejects seat numbers outside 1..N or without a number", () => {
    const s = empty();
    expect(moveCard(s, 3, "anna", { zone: "seat", position: 4 })).toMatchObject({ ok: false, error: "seat_missing" });
    expect(moveCard(s, 3, "anna", { zone: "seat", position: 0 })).toMatchObject({ ok: false, error: "seat_missing" });
    expect(moveCard(s, 3, "anna", { zone: "seat" })).toMatchObject({ ok: false, error: "seat_missing" });
  });

  it("moves a card from one seat to a free seat", () => {
    const { state } = play(empty(), 5, [
      ["anna", "seat", 1],
      ["anna", "seat", 4],
    ]);
    expect(freeSeats(state, 5)).toEqual([1, 2, 3, 5]);
  });
});

describe("Auch gern is an ordered list", () => {
  it("appends by default and inserts at a position, renumbering without gaps", () => {
    const { state } = play(empty(), 5, [
      ["anna", "also"],
      ["ben", "also"],
      ["clara", "also", 1],
    ]);
    expect(alsoNames(state)).toEqual(["1:clara", "2:anna", "3:ben"]);
  });

  it("closes the gap when a card leaves and reorders within the list", () => {
    let { state } = play(empty(), 5, [
      ["anna", "also"],
      ["ben", "also"],
      ["clara", "also"],
      ["ben", "reject"],
    ]);
    expect(alsoNames(state)).toEqual(["1:anna", "2:clara"]);
    state = ok(moveCard(state, 5, "clara", { zone: "also", position: 1 })).state;
    expect(alsoNames(state)).toEqual(["1:clara", "2:anna"]);
  });

  it("clamps positions to the end of the list", () => {
    const { state } = play(empty(), 5, [
      ["anna", "also"],
      ["ben", "also", 99],
    ]);
    expect(alsoNames(state)).toEqual(["1:anna", "2:ben"]);
  });

  it("does not touch seats when the list changes", () => {
    const { state } = play(empty(), 5, [
      ["dora", "seat", 2],
      ["anna", "also"],
      ["ben", "also", 1],
    ]);
    expect(at(state, "dora")).toEqual({ applicantId: "dora", zone: "seat", position: 2 });
  });
});

describe("moveCard", () => {
  it("returns the move for the history", () => {
    const { history } = play(empty(), 5, [
      ["anna", "seat", 2],
      ["anna", "also"],
    ]);
    expect(history).toEqual([
      { id: "e1", applicantId: "anna", fromZone: "pool", fromPosition: null, toZone: "seat", toPosition: 2 },
      { id: "e2", applicantId: "anna", fromZone: "seat", fromPosition: 2, toZone: "also", toPosition: 1 },
    ]);
  });

  it("rejects moves to the same place and unknown cards", () => {
    const { state } = play(empty(), 5, [["anna", "seat", 1]]);
    expect(moveCard(state, 5, "anna", { zone: "seat", position: 1 })).toEqual({ ok: false, error: "unchanged" });
    expect(moveCard(state, 5, "ben", { zone: "pool" })).toEqual({ ok: false, error: "unchanged" });
    expect(moveCard(state, 5, "xaver", { zone: "pool" })).toEqual({ ok: false, error: "unknown_applicant" });
  });

  it("does not change the state it was given", () => {
    const s = empty();
    const copy = structuredClone(s);
    moveCard(s, 5, "anna", { zone: "also" });
    expect(s).toEqual(copy);
  });
});

describe("undoMove", () => {
  const setup = () =>
    play(empty(), 5, [
      ["anna", "seat", 1],
      ["ben", "also"],
      ["clara", "also"],
      ["dora", "also"],
      ["emil", "reject"],
    ]);

  it("restores exactly the previous state for every kind of move", () => {
    const cases: [string, Move["toZone"], number?][] = [
      ["anna", "pool"],
      ["anna", "seat", 4],
      ["anna", "also", 2],
      ["clara", "seat", 3],
      ["clara", "also", 1],
      ["clara", "reject"],
      ["ben", "also", 3],
      ["emil", "also", 1],
      ["dora", "pool"],
    ];
    for (const step of cases) {
      const before = setup();
      const after = play(before.state, 5, [step]);
      const history = [...before.history, { ...after.history[0], id: "x" }];
      const undone = ok(undoMove(after.state, 5, history, "x"));
      expect(undone.state, `undo ${step.join(" ")}`).toEqual(before.state);
    }
  });

  it("returns the reverse move for the history, and undoing the undo moves forward again", () => {
    const before = setup();
    const moved = play(before.state, 5, [["anna", "reject"]]);
    const history: HistoryEntry[] = [{ ...moved.history[0], id: "m" }];
    const undo = ok(undoMove(moved.state, 5, history, "m"));
    expect(undo.move).toEqual({ applicantId: "anna", fromZone: "reject", fromPosition: null, toZone: "seat", toPosition: 1 });
    history.push({ ...undo.move, id: "u" });
    const redo = ok(undoMove(undo.state, 5, history, "u"));
    expect(redo.state).toEqual(moved.state);
  });

  it("rejects when the card has been moved since, also within Auch gern", () => {
    const { state, history } = setup();
    const later = ok(moveCard(state, 5, "clara", { zone: "also", position: 1 }));
    const h = [...history, { ...later.move, id: "later" }];
    expect(undoMove(later.state, 5, h, "e3")).toEqual({ ok: false, error: "moved_since" });
    expect(undoMove(state, 5, history, "e3").ok).toBe(true);
  });

  it("rejects when the old seat is now taken by someone else", () => {
    const { state, history } = play(empty(), 5, [
      ["anna", "seat", 1],
      ["anna", "pool"],
      ["ben", "seat", 1],
    ]);
    expect(undoMove(state, 5, history, "e2")).toEqual({ ok: false, error: "seat_taken", position: 1 });
  });

  it("rejects when the old seat no longer exists", () => {
    const { state, history } = play(empty(), 5, [
      ["anna", "seat", 5],
      ["anna", "pool"],
    ]);
    expect(undoMove(state, 4, history, "e2")).toEqual({ ok: false, error: "origin_gone", position: 5 });
  });

  it("rejects unknown entries", () => {
    const { state, history } = setup();
    expect(undoMove(state, 5, history, "nope")).toEqual({ ok: false, error: "unknown_entry" });
  });
});

describe("changeSeats", () => {
  it("adds a seat", () => {
    expect(changeSeats(empty(), 10, 1)).toEqual({ ok: true, seats: 11 });
  });

  it("removes the last seat only while it is empty", () => {
    const { state } = play(empty(), 3, [["anna", "seat", 3]]);
    expect(changeSeats(state, 3, -1)).toEqual({ ok: false, error: "seat_taken", position: 3 });
    const freed = ok(moveCard(state, 3, "anna", { zone: "seat", position: 1 })).state;
    expect(changeSeats(freed, 3, -1)).toEqual({ ok: true, seats: 2 });
  });

  it("keeps at least one seat", () => {
    expect(changeSeats(empty(), 1, -1)).toEqual({ ok: false, error: "minimum" });
  });
});

describe("shortScore", () => {
  const criteria: ScoreCriterion[] = [
    { id: "c1", weight: 1, scaleMin: 1, scaleMax: 5 },
    { id: "c2", weight: 2, scaleMin: 0, scaleMax: 10 },
  ];

  it("scales each criterion to 0..1, weights, and shows the result on the first scale", () => {
    // c1: 4 on 1..5 = 0.75; c2: 5 on 0..10 = 0.5; (0.75·1 + 0.5·2) / 3 = 0.5833 → 1 + 0.5833·4 = 3.333
    const r = shortScore(criteria, [
      { submitted: true, scores: [{ criterionId: "c1", score: 4 }, { criterionId: "c2", score: 5 }] },
    ]);
    expect(r.feedbackCount).toBe(1);
    expect(r.value).toBeCloseTo(3 + 1 / 3, 10);
    expect(formatShortScore(r.value)).toBe("3,3");
  });

  it("averages all submitted scores of both interviewers", () => {
    // A: 5 → 1, 10 → 1; B: 1 → 0, 0 → 0 → (1 + 2 + 0 + 0) / 6 = 0.5 → 3
    const r = shortScore(criteria, [
      { submitted: true, scores: [{ criterionId: "c1", score: 5 }, { criterionId: "c2", score: 10 }] },
      { submitted: true, scores: [{ criterionId: "c1", score: 1 }, { criterionId: "c2", score: 0 }] },
    ]);
    expect(r).toEqual({ value: 3, feedbackCount: 2 });
  });

  it("gives the same result for the same judgement on different scales", () => {
    const top = shortScore(criteria, [
      { submitted: true, scores: [{ criterionId: "c1", score: 5 }, { criterionId: "c2", score: 10 }] },
    ]);
    expect(top.value).toBe(5);
  });

  it("ignores drafts", () => {
    const r = shortScore(criteria, [
      { submitted: true, scores: [{ criterionId: "c1", score: 5 }, { criterionId: "c2", score: 10 }] },
      { submitted: false, scores: [{ criterionId: "c1", score: 1 }, { criterionId: "c2", score: 0 }] },
    ]);
    expect(r).toEqual({ value: 5, feedbackCount: 1 });
  });

  it("shows – without submitted feedback", () => {
    expect(shortScore(criteria, [])).toEqual({ value: null, feedbackCount: 0 });
    const onlyDraft = shortScore(criteria, [{ submitted: false, scores: [{ criterionId: "c1", score: 3 }] }]);
    expect(onlyDraft.value).toBeNull();
    expect(formatShortScore(onlyDraft.value)).toBe("–");
    expect(shortScore([], [{ submitted: true, scores: [] }]).value).toBeNull();
  });

  it("formats with one decimal and a comma", () => {
    expect(formatShortScore(4)).toBe("4,0");
    expect(formatShortScore(3.25)).toBe("3,3");
  });
});

describe("composition", () => {
  const cards = [
    { applicantId: "anna", cohort: "2025", departmentIds: ["d1"], departmentAll: false },
    { applicantId: "ben", cohort: "2024", departmentIds: ["d1", "d2"], departmentAll: false },
    { applicantId: "clara", cohort: "2025", departmentIds: ["d3"], departmentAll: false },
    { applicantId: "dora", cohort: "2025", departmentIds: [], departmentAll: false },
    { applicantId: "emil", cohort: "2023", departmentIds: ["d3"], departmentAll: false },
  ];

  it("counts only cards on seats, by cohort and by department", () => {
    const { state } = play(empty(), 10, [
      ["anna", "seat", 1],
      ["ben", "seat", 5],
      ["clara", "seat", 7],
      ["dora", "seat", 2],
      ["emil", "also"],
    ]);
    expect(composition(state, 10, cards, ["d1", "d2", "d3"])).toEqual({
      filled: 4,
      seats: 10,
      cohorts: [
        { cohort: "2024", count: 1 },
        { cohort: "2025", count: 3 },
      ],
      departments: [
        { key: "d1", count: 2 },
        { key: "d2", count: 1 },
        { key: "d3", count: 1 },
        { key: NONE, count: 1 },
      ],
    });
  });

  it("counts 'für alle offen' as its own entry, not in every department", () => {
    const withAll = cards.map((c) => (c.applicantId === "dora" ? { ...c, departmentAll: true } : c));
    const { state } = play(empty(), 10, [
      ["anna", "seat", 1],
      ["dora", "seat", 2],
    ]);
    expect(composition(state, 10, withAll, ["d1", "d2"]).departments).toEqual([
      { key: "d1", count: 1 },
      { key: "d2", count: 0 },
      { key: ALL, count: 1 },
    ]);
  });

  it("is empty with no one on a seat", () => {
    expect(composition(empty(), 10, cards, ["d1"])).toEqual({
      filled: 0,
      seats: 10,
      cohorts: [],
      departments: [{ key: "d1", count: 0 }],
    });
  });
});
