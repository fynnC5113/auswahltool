import { describe, expect, it } from "vitest";
import {
  NONE,
  boardState,
  changeSeats,
  composition,
  formatShortScore,
  freeSeats,
  moveCard,
  poolOrder,
  shortScore,
  toggleDepartment,
  undoBlock,
  undoMove,
  type BoardEvent,
  type BoardState,
  type HistoryEntry,
  type Move,
  type MoveResult,
  type ScoreCriterion,
  type Zone,
} from "./board-rules";

const ids = ["anna", "ben", "clara", "dora", "emil"];
const empty = () => boardState(ids, []);
// Short scores for the starting order of the pool: clara 4.5, anna 3, ben 3, emil 2, dora –.
const SCORES: Record<string, number | null> = { anna: 3, ben: 3, clara: 4.5, dora: null, emil: 2 };
const rank = (id: string) => ({ score: SCORES[id] ?? null, name: id });
const pool = (s: BoardState) => poolOrder(s, rank);

function ok(r: MoveResult): { state: BoardState; move: Move } {
  if (!r.ok) throw new Error(`move failed: ${r.error}`);
  return r;
}

/** Applies moves in order and returns the state and the history. */
function play(state: BoardState, seats: number, steps: [string, Move["toZone"], number?][]) {
  const history: HistoryEntry[] = [];
  for (const [id, zone, position] of steps) {
    const r = ok(moveCard(state, seats, id, { zone, position }, pool(state)));
    state = r.state;
    history.push({ ...r.move, id: `e${history.length + 1}` });
  }
  return { state, history };
}

const at = (s: BoardState, id: string) => s.find((p) => p.applicantId === id);

describe("boardState", () => {
  it("puts applicants without a stored row into the pool and drops positions in reject", () => {
    const s = boardState(["anna", "ben"], [{ applicantId: "ben", zone: "reject", position: 4 }]);
    expect(s).toEqual([
      { applicantId: "anna", zone: "pool", position: null },
      { applicantId: "ben", zone: "reject", position: null },
    ]);
  });
});

describe("pool order", () => {
  it("starts by short score, best first, '–' last, ties by name", () => {
    expect(pool(empty())).toEqual(["clara", "anna", "ben", "emil", "dora"]);
  });

  it("stores the whole pool in the shown order once a card is moved within it", () => {
    const { state } = play(empty(), 5, [["emil", "pool", 1]]);
    expect(pool(state)).toEqual(["emil", "clara", "anna", "ben", "dora"]);
    expect(state.filter((p) => p.zone === "pool").every((p) => p.position !== null)).toBe(true);
    // The order no longer depends on the short score.
    expect(poolOrder(state, (id) => ({ score: id === "dora" ? 5 : null, name: id }))).toEqual(["emil", "clara", "anna", "ben", "dora"]);
  });

  it("closes the gap when a card leaves and puts a returning card at the chosen place", () => {
    const { state } = play(empty(), 5, [
      ["emil", "pool", 1],
      ["anna", "seat", 2],
      ["anna", "pool", 2],
    ]);
    expect(pool(state)).toEqual(["emil", "anna", "clara", "ben", "dora"]);
    expect(state.filter((p) => p.zone === "pool").map((p) => p.position).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("appends by default and clamps places to the end", () => {
    const one = play(empty(), 5, [
      ["clara", "reject"],
      ["clara", "pool"],
    ]);
    expect(pool(one.state).at(-1)).toBe("clara");
    const two = play(empty(), 5, [["clara", "pool", 99]]);
    expect(pool(two.state).at(-1)).toBe("clara");
  });

  it("keeps the starting order of cards without a place when another card leaves", () => {
    const { state } = play(empty(), 5, [["clara", "seat", 1]]);
    expect(pool(state)).toEqual(["anna", "ben", "emil", "dora"]);
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
    expect(moveCard(state, 2, "clara", { zone: "seat", position: 1 }, pool(state))).toEqual({ ok: false, error: "seat_taken", position: 1 });
    expect(freeSeats(state, 2)).toEqual([]);
  });

  it("rejects seat numbers outside 1..N or without a number", () => {
    const s = empty();
    expect(moveCard(s, 3, "anna", { zone: "seat", position: 4 }, pool(s))).toMatchObject({ ok: false, error: "seat_missing" });
    expect(moveCard(s, 3, "anna", { zone: "seat", position: 0 }, pool(s))).toMatchObject({ ok: false, error: "seat_missing" });
    expect(moveCard(s, 3, "anna", { zone: "seat" }, pool(s))).toMatchObject({ ok: false, error: "seat_missing" });
  });

  it("moves a card from one seat to a free seat", () => {
    const { state } = play(empty(), 5, [
      ["anna", "seat", 1],
      ["anna", "seat", 4],
    ]);
    expect(at(state, "anna")?.position).toBe(4);
    expect(freeSeats(state, 5)).toEqual([1, 2, 3, 5]);
  });
});

describe("moveCard", () => {
  it("returns the move for the history, with the shown pool place as origin", () => {
    const s = empty();
    const r = ok(moveCard(s, 5, "ben", { zone: "seat", position: 2 }, pool(s)));
    expect(r.move).toEqual({ applicantId: "ben", fromZone: "pool", fromPosition: 3, toZone: "seat", toPosition: 2 });
    const back = ok(moveCard(r.state, 5, "ben", { zone: "reject" }, pool(r.state)));
    expect(back.move).toEqual({ applicantId: "ben", fromZone: "seat", fromPosition: 2, toZone: "reject", toPosition: null });
  });

  it("rejects moves to the same place, unknown cards and a pool that does not match", () => {
    const { state } = play(empty(), 5, [["anna", "reject"]]);
    expect(moveCard(state, 5, "anna", { zone: "reject" }, pool(state))).toEqual({ ok: false, error: "unchanged" });
    expect(moveCard(state, 5, "clara", { zone: "pool", position: 1 }, pool(state))).toEqual({ ok: false, error: "unchanged" });
    expect(moveCard(state, 5, "zoe", { zone: "reject" }, pool(state))).toEqual({ ok: false, error: "unknown_applicant" });
    expect(moveCard(state, 5, "ben", { zone: "reject" }, [...pool(state), "anna"])).toEqual({ ok: false, error: "stale" });
  });

  it("does not change the state it was given", () => {
    const s = empty();
    const copy = structuredClone(s);
    moveCard(s, 5, "anna", { zone: "seat", position: 1 }, pool(s));
    expect(s).toEqual(copy);
  });
});

describe("undoMove", () => {
  const seated = (s: BoardState) => s.filter((p) => p.zone === "seat").sort((a, b) => a.position! - b.position!);
  const view = (s: BoardState) => ({
    pool: pool(s),
    seat: seated(s),
    reject: s
      .filter((p) => p.zone === "reject")
      .map((p) => p.applicantId)
      .sort(),
  });

  it("restores exactly the previous board for every kind of move", () => {
    const base = play(empty(), 5, [
      ["emil", "pool", 1],
      ["anna", "seat", 1],
      ["ben", "reject"],
    ]).state;
    const cases: [string, Move["toZone"], number?][] = [
      ["clara", "seat", 3],
      ["anna", "seat", 5],
      ["anna", "pool", 2],
      ["anna", "reject"],
      ["ben", "pool", 1],
      ["ben", "seat", 2],
      ["emil", "pool", 3],
      ["dora", "reject"],
    ];
    for (const step of cases) {
      const { state, history } = play(base, 5, [step]);
      const undone = ok(undoMove(state, 5, history, "e1", pool(state)));
      expect(view(undone.state), step.join(" ")).toEqual(view(base));
    }
  });

  it("returns the reverse move for the history, and undoing the undo moves forward again", () => {
    const { state, history } = play(empty(), 5, [["anna", "seat", 2]]);
    const undo = ok(undoMove(state, 5, history, "e1", pool(state)));
    expect(undo.move).toEqual({ applicantId: "anna", fromZone: "seat", fromPosition: 2, toZone: "pool", toPosition: 2 });
    const all = [...history, { ...undo.move, id: "e2" }];
    const redo = ok(undoMove(undo.state, 5, all, "e2", pool(undo.state)));
    expect(at(redo.state, "anna")).toEqual({ applicantId: "anna", zone: "seat", position: 2 });
  });

  it("rejects when the card has been moved since, also within the pool", () => {
    const { state, history } = play(empty(), 5, [
      ["anna", "pool", 1],
      ["anna", "pool", 3],
    ]);
    expect(undoMove(state, 5, history, "e1", pool(state))).toEqual({ ok: false, error: "moved_since" });
  });

  it("rejects when the old seat is now taken by someone else", () => {
    const { state, history } = play(empty(), 5, [
      ["anna", "seat", 1],
      ["anna", "seat", 2],
      ["ben", "seat", 1],
    ]);
    expect(undoMove(state, 5, history, "e2", pool(state))).toEqual({ ok: false, error: "seat_taken", position: 1 });
  });

  it("rejects when the old seat no longer exists", () => {
    const { state, history } = play(empty(), 5, [
      ["anna", "seat", 5],
      ["anna", "reject"],
    ]);
    expect(undoMove(state, 4, history, "e2", pool(state))).toEqual({ ok: false, error: "origin_gone", position: 5 });
  });

  it("rejects unknown entries", () => {
    expect(undoMove(empty(), 5, [], "x", pool(empty()))).toEqual({ ok: false, error: "unknown_entry" });
  });
});

describe("changeSeats", () => {
  it("adds a seat", () => {
    expect(changeSeats(empty(), 10, 1)).toEqual({ ok: true, seats: 11 });
  });

  it("removes the last seat only while it is empty", () => {
    const { state } = play(empty(), 3, [["anna", "seat", 3]]);
    expect(changeSeats(state, 3, -1)).toEqual({ ok: false, error: "seat_taken", position: 3 });
    const moved = play(state, 3, [["anna", "seat", 1]]).state;
    expect(changeSeats(moved, 3, -1)).toEqual({ ok: true, seats: 2 });
  });

  it("keeps at least one seat", () => {
    expect(changeSeats(empty(), 1, -1)).toEqual({ ok: false, error: "minimum" });
  });
});

describe("toggleDepartment", () => {
  it("adds up to two departments and removes one again", () => {
    expect(toggleDepartment([], "d1")).toEqual({ ok: true, ids: ["d1"] });
    expect(toggleDepartment(["d1"], "d2")).toEqual({ ok: true, ids: ["d1", "d2"] });
    expect(toggleDepartment(["d1", "d2"], "d1")).toEqual({ ok: true, ids: ["d2"] });
  });

  it("rejects a third department", () => {
    expect(toggleDepartment(["d1", "d2"], "d3")).toEqual({ ok: false, error: "too_many" });
  });
});

describe("undoBlock", () => {
  const blank = { applicantId: null, fromZone: null, fromPosition: null, toZone: null, toPosition: null, fromSeats: null, toSeats: null, fromDepartments: null, toDepartments: null, undoes: null };
  const mv = (id: string, applicantId: string, from: [Zone, number | null], to: [Zone, number | null], undoes: string | null = null): BoardEvent => ({
    ...blank,
    id,
    kind: "move",
    applicantId,
    fromZone: from[0],
    fromPosition: from[1],
    toZone: to[0],
    toPosition: to[1],
    undoes,
  });
  const seatsEv = (id: string, from: number, to: number): BoardEvent => ({ ...blank, id, kind: "seats", fromSeats: from, toSeats: to });
  const depEv = (id: string, applicantId: string, from: string[], to: string[]): BoardEvent => ({
    ...blank,
    id,
    kind: "departments",
    applicantId,
    fromDepartments: from,
    toDepartments: to,
  });
  const onSeats = (...seated: [string, number][]) =>
    boardState(ids, seated.map(([applicantId, position]) => ({ applicantId, zone: "seat" as const, position })));

  it("allows undoing a move while the card is still where the entry put it", () => {
    const state = onSeats(["anna", 2]);
    expect(undoBlock([mv("e1", "anna", ["pool", 1], ["seat", 2])], "e1", state, 5, {}, false)).toBeNull();
  });

  it("rejects a move that was already undone or where the card moved later", () => {
    const state = onSeats(["anna", 3]);
    const history = [mv("e1", "anna", ["pool", 1], ["seat", 2]), mv("e2", "anna", ["seat", 2], ["seat", 3])];
    expect(undoBlock(history, "e1", state, 5, {}, true)).toEqual({ error: "moved_since" });
    const back = [mv("e1", "anna", ["pool", 1], ["seat", 2]), mv("e2", "anna", ["seat", 2], ["pool", 1], "e1")];
    expect(undoBlock(back, "e1", empty(), 5, {}, true)).toEqual({ error: "already_undone" });
    // The undo itself can be undone (the card is back in the pool).
    expect(undoBlock(back, "e2", empty(), 5, {}, true)).toBeNull();
  });

  it("rejects a move back to a taken or removed seat", () => {
    const taken = onSeats(["ben", 1]);
    const history = [mv("e1", "anna", ["seat", 1], ["reject", null])];
    const state = taken.map((p) => (p.applicantId === "anna" ? { ...p, zone: "reject" as const } : p));
    expect(undoBlock(history, "e1", state, 5, {}, true)).toEqual({ error: "seat_taken", position: 1 });
    const gone = [mv("e1", "anna", ["seat", 5], ["reject", null])];
    const rejected = empty().map((p) => (p.applicantId === "anna" ? { ...p, zone: "reject" as const } : p));
    expect(undoBlock(gone, "e1", rejected, 4, {}, true)).toEqual({ error: "origin_gone", position: 5 });
  });

  it("lets only admins undo the seats, and only while the number is unchanged", () => {
    expect(undoBlock([seatsEv("e1", 10, 11)], "e1", empty(), 11, {}, false)).toEqual({ error: "not_admin" });
    expect(undoBlock([seatsEv("e1", 10, 11)], "e1", empty(), 11, {}, true)).toBeNull();
    expect(undoBlock([seatsEv("e1", 10, 11)], "e1", empty(), 12, {}, true)).toEqual({ error: "changed_since" });
    // Undoing "+" removes seat 11, which must be empty.
    expect(undoBlock([seatsEv("e1", 10, 11)], "e1", onSeats(["anna", 11]), 11, {}, true)).toEqual({ error: "seat_taken", position: 11 });
    expect(undoBlock([seatsEv("e1", 11, 10)], "e1", onSeats(["anna", 10]), 10, {}, true)).toBeNull();
  });

  it("undoes departments only on a seat and only while they are unchanged", () => {
    const state = onSeats(["anna", 1]);
    const history = [depEv("e1", "anna", [], ["d1", "d2"])];
    expect(undoBlock(history, "e1", state, 5, { anna: ["d2", "d1"] }, false)).toBeNull();
    expect(undoBlock(history, "e1", state, 5, { anna: ["d1"] }, false)).toEqual({ error: "changed_since" });
    expect(undoBlock(history, "e1", empty(), 5, { anna: ["d1", "d2"] }, false)).toEqual({ error: "not_seated" });
  });

  it("never undoes freezing, and rejects unknown entries", () => {
    const freeze: BoardEvent = { ...blank, id: "e1", kind: "freeze" };
    expect(undoBlock([freeze], "e1", empty(), 5, {}, true)).toEqual({ error: "not_undoable" });
    expect(undoBlock([], "x", empty(), 5, {}, true)).toEqual({ error: "unknown_entry" });
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
  const cohorts = ["2025", "2024", "2025", "2025", "2023"];
  const cards = ids.map((id, i) => ({ applicantId: id, cohort: cohorts[i] }));

  it("counts only cards on seats, by cohort and by the departments given on the board", () => {
    const { state } = play(empty(), 10, [
      ["anna", "seat", 1],
      ["ben", "seat", 5],
      ["clara", "seat", 7],
      ["dora", "seat", 2],
      ["emil", "reject"],
    ]);
    const assigned = new Map([
      ["anna", ["d1"]],
      ["ben", ["d1", "d2"]],
      ["clara", ["d3"]],
      ["emil", ["d3"]],
    ]);
    expect(composition(state, 10, cards, assigned, ["d1", "d2", "d3"])).toEqual({
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

  it("ignores departments of other rounds", () => {
    const { state } = play(empty(), 10, [["anna", "seat", 1]]);
    expect(composition(state, 10, cards, new Map([["anna", ["x"]]]), ["d1"]).departments).toEqual([
      { key: "d1", count: 0 },
      { key: NONE, count: 1 },
    ]);
  });

  it("is empty with no one on a seat", () => {
    expect(composition(empty(), 10, cards, new Map(), ["d1"])).toEqual({
      filled: 0,
      seats: 10,
      cohorts: [],
      departments: [{ key: "d1", count: 0 }],
    });
  });
});
