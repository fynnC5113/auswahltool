// Board rules without a database (Phase 15, reworked in Phase 16, Fynn
// 29./30.09.2026): moving a card, undo, seats, departments given on the
// board, short score and composition bar.
//
// Three zones. Pool: ordered, what is left there at the end is the waiting
// list in this order. Seat: fixed boxes 1..N, a card keeps its seat number
// until someone moves that card, a freed seat stays empty, dropping on a taken
// seat is rejected, "−" removes only the last seat and only while it is
// empty. Reject: no order. The database checks the same rules again
// (move_card, set_seats, set_board_departments).

export type Zone = "pool" | "seat" | "reject";
export type Placement = { applicantId: string; zone: Zone; position: number | null };
/** One placement per applicant. */
export type BoardState = Placement[];

/** Board state for these applicants; applicants without a stored row start in the pool without a place. */
export function boardState(applicantIds: string[], stored: Placement[]): BoardState {
  return applicantIds.map((id) => {
    const p = stored.find((s) => s.applicantId === id);
    return p ? { ...p, position: p.zone === "reject" ? null : p.position } : { applicantId: id, zone: "pool", position: null };
  });
}

export type Rank = { score: number | null; name: string };

/**
 * The pool from top to bottom: cards with a stored place in that order, then
 * cards without one by short score (best first, "–" last), then by name. The
 * database stores places once someone moves a card into or within the pool.
 */
export function poolOrder(state: BoardState, rank: (applicantId: string) => Rank): string[] {
  const pool = state.filter((p) => p.zone === "pool");
  const placed = pool.filter((p) => p.position !== null).sort((a, b) => a.position! - b.position!);
  const open = pool
    .filter((p) => p.position === null)
    .map((p) => ({ id: p.applicantId, ...rank(p.applicantId) }))
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.name.localeCompare(b.name, "de"));
  return [...placed.map((p) => p.applicantId), ...open.map((p) => p.id)];
}

/** Seat numbers 1..seats without a card. */
export function freeSeats(state: BoardState, seats: number): number[] {
  const taken = new Set(state.filter((p) => p.zone === "seat").map((p) => p.position));
  return Array.from({ length: seats }, (_, i) => i + 1).filter((n) => !taken.has(n));
}

/** A move as stored in board_events. */
export type Move = {
  applicantId: string;
  fromZone: Zone;
  fromPosition: number | null;
  toZone: Zone;
  toPosition: number | null;
};

export type Target = { zone: Zone; position?: number | null };

export type MoveError =
  | "unknown_applicant" // no card with this id
  | "unknown_entry" // undo: no history entry with this id
  | "unchanged" // the card is already there
  | "seat_missing" // seat number outside 1..N or not given
  | "seat_taken" // another card is on this seat
  | "stale" // the pool passed in does not match the state
  | "moved_since" // undo: the card is no longer where the entry put it
  | "origin_gone"; // undo: the old seat no longer exists

export type MoveResult = { ok: true; state: BoardState; move: Move } | { ok: false; error: MoveError; position?: number };

/**
 * Moves one card. pool: the pool as shown (poolOrder), before the move.
 * Seat: a free seat 1..seats. Pool: insert at the given place (1 = top,
 * default: end); the whole pool is then stored as 1..n, as move_card does.
 * Reject: no position. When a card leaves the pool, the stored places close
 * their gap.
 */
export function moveCard(state: BoardState, seats: number, applicantId: string, target: Target, pool: string[]): MoveResult {
  const card = state.find((p) => p.applicantId === applicantId);
  if (!card) return { ok: false, error: "unknown_applicant" };
  const inPool = state.filter((p) => p.zone === "pool").map((p) => p.applicantId);
  if (inPool.length !== pool.length || !inPool.every((id) => pool.includes(id))) return { ok: false, error: "stale" };

  const fromPosition = card.zone === "pool" ? pool.indexOf(applicantId) + 1 : card.position;
  let toPosition: number | null = null;
  let newPool: string[] | null = null;

  if (target.zone === "seat") {
    const n = target.position;
    if (n == null || !Number.isInteger(n) || n < 1 || n > seats) return { ok: false, error: "seat_missing", position: n ?? undefined };
    if (card.zone === "seat" && card.position === n) return { ok: false, error: "unchanged" };
    if (state.some((p) => p.zone === "seat" && p.position === n)) return { ok: false, error: "seat_taken", position: n };
    toPosition = n;
  } else if (target.zone === "pool") {
    const others = pool.filter((id) => id !== applicantId);
    toPosition = Math.min(Math.max(1, Math.trunc(target.position ?? others.length + 1)), others.length + 1);
    if (card.zone === "pool" && fromPosition === toPosition) return { ok: false, error: "unchanged" };
    newPool = [...others.slice(0, toPosition - 1), applicantId, ...others.slice(toPosition - 1)];
  } else if (card.zone === "reject") {
    return { ok: false, error: "unchanged" };
  }

  const move: Move = { applicantId, fromZone: card.zone, fromPosition, toZone: target.zone, toPosition };
  return { ok: true, state: apply(state, move, newPool), move };
}

function apply(state: BoardState, move: Move, newPool: string[] | null): BoardState {
  if (newPool) {
    const place = new Map(newPool.map((id, i) => [id, i + 1]));
    return state.map((p) => (place.has(p.applicantId) ? { applicantId: p.applicantId, zone: "pool", position: place.get(p.applicantId)! } : p));
  }
  const moved: Placement = { applicantId: move.applicantId, zone: move.toZone, position: move.toPosition };
  const placed = state
    .filter((p) => p.zone === "pool" && p.position !== null && p.applicantId !== move.applicantId)
    .sort((a, b) => a.position! - b.position!);
  const place = new Map(placed.map((p, i) => [p.applicantId, i + 1]));
  return state.map((p) => {
    if (p.applicantId === move.applicantId) return moved;
    return place.has(p.applicantId) ? { ...p, position: place.get(p.applicantId)! } : p;
  });
}

/** A stored history entry (board_events of kind "move"), history in chronological order. */
export type HistoryEntry = Move & { id: string };

/**
 * Undo of a history entry: moves the card back where it came from and
 * returns that as a new move (stored with undoes_event_id). Rejected if the
 * card has been moved since (a later entry for the same card, also an undo),
 * or if its old seat is taken or no longer exists. Back into the pool means
 * back to its old place there (or the end, if the pool got shorter).
 */
export function undoMove(state: BoardState, seats: number, history: HistoryEntry[], entryId: string, pool: string[]): MoveResult {
  const index = history.findIndex((e) => e.id === entryId);
  if (index < 0) return { ok: false, error: "unknown_entry" };
  const entry = history[index];
  const card = state.find((p) => p.applicantId === entry.applicantId);
  if (!card) return { ok: false, error: "unknown_applicant" };
  const movedLater = history.slice(index + 1).some((e) => e.applicantId === entry.applicantId);
  const stillThere = card.zone === entry.toZone && (entry.toZone !== "seat" || card.position === entry.toPosition);
  if (movedLater || !stillThere) return { ok: false, error: "moved_since" };
  if (entry.fromZone === "seat" && (entry.fromPosition ?? 0) > seats) {
    return { ok: false, error: "origin_gone", position: entry.fromPosition ?? undefined };
  }
  return moveCard(state, seats, entry.applicantId, { zone: entry.fromZone, position: entry.fromPosition }, pool);
}

export type SeatsResult = { ok: true; seats: number } | { ok: false; error: "seat_taken" | "minimum"; position?: number };

/** "+" adds seat N+1. "−" removes seat N, only while it is empty; at least one seat remains. */
export function changeSeats(state: BoardState, seats: number, delta: 1 | -1): SeatsResult {
  if (delta === 1) return { ok: true, seats: seats + 1 };
  if (seats <= 1) return { ok: false, error: "minimum" };
  if (state.some((p) => p.zone === "seat" && p.position === seats)) return { ok: false, error: "seat_taken", position: seats };
  return { ok: true, seats: seats - 1 };
}

// ---------------------------------------------------------------------------
// Departments given on the board (Fynn, 30.09.2026): one or two per card on a
// seat, never filled in from the applicant's wish.
// ---------------------------------------------------------------------------

export const MAX_BOARD_DEPARTMENTS = 2;

export type DepartmentsResult = { ok: true; ids: string[] } | { ok: false; error: "too_many" };

/** Adds or removes one department of a card; a third one is rejected. */
export function toggleDepartment(current: string[], departmentId: string): DepartmentsResult {
  if (current.includes(departmentId)) return { ok: true, ids: current.filter((id) => id !== departmentId) };
  if (current.length >= MAX_BOARD_DEPARTMENTS) return { ok: false, error: "too_many" };
  return { ok: true, ids: [...current, departmentId] };
}

// ---------------------------------------------------------------------------
// History with undo (Phase 17, Fynn 30.09.2026): every member undoes moves
// and departments, admins also "+"/"−". The database checks the same in
// undo_board_event; here it decides whether "Rückgängig" is offered and why not.
// ---------------------------------------------------------------------------

export type EventKind = "move" | "seats" | "departments" | "freeze" | "unfreeze";

/** A board_events row, history in order (seq). */
export type BoardEvent = {
  id: string;
  kind: EventKind;
  applicantId: string | null;
  fromZone: Zone | null;
  fromPosition: number | null;
  toZone: Zone | null;
  toPosition: number | null;
  fromSeats: number | null;
  toSeats: number | null;
  fromDepartments: string[] | null;
  toDepartments: string[] | null;
  /** This entry undoes that one. */
  undoes: string | null;
};

export type UndoBlock =
  | { error: "unknown_entry" | "not_undoable" | "already_undone" | "moved_since" | "changed_since" | "not_seated" | "not_admin" }
  | { error: "origin_gone" | "seat_taken"; position: number };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Why an entry cannot be undone right now, or null if it can. */
export function undoBlock(
  history: BoardEvent[],
  entryId: string,
  state: BoardState,
  seats: number,
  assigned: Record<string, string[]>,
  isAdmin: boolean,
): UndoBlock | null {
  const index = history.findIndex((e) => e.id === entryId);
  if (index < 0) return { error: "unknown_entry" };
  const e = history[index];
  if (e.kind === "freeze" || e.kind === "unfreeze") return { error: "not_undoable" };
  const later = history.slice(index + 1);
  if (later.some((x) => x.undoes === e.id)) return { error: "already_undone" };

  if (e.kind === "move") {
    const card = state.find((p) => p.applicantId === e.applicantId);
    if (!card) return { error: "moved_since" };
    const movedLater = later.some((x) => x.kind === "move" && x.applicantId === e.applicantId);
    const stillThere = card.zone === e.toZone && (card.zone !== "seat" || card.position === e.toPosition);
    if (movedLater || !stillThere) return { error: "moved_since" };
    if (e.fromZone === "seat" && e.fromPosition !== null) {
      if (e.fromPosition > seats) return { error: "origin_gone", position: e.fromPosition };
      if (state.some((p) => p.zone === "seat" && p.position === e.fromPosition)) return { error: "seat_taken", position: e.fromPosition };
    }
    return null;
  }

  if (e.kind === "seats") {
    if (!isAdmin) return { error: "not_admin" };
    if (seats !== e.toSeats) return { error: "changed_since" };
    // Undoing "+" removes that seat again, which needs it empty.
    if (e.toSeats! > e.fromSeats! && state.some((p) => p.zone === "seat" && p.position === e.toSeats)) {
      return { error: "seat_taken", position: e.toSeats! };
    }
    return null;
  }

  const card = state.find((p) => p.applicantId === e.applicantId);
  if (card?.zone !== "seat") return { error: "not_seated" };
  if (!sameSet(assigned[e.applicantId!] ?? [], e.toDepartments ?? [])) return { error: "changed_since" };
  return null;
}

// ---------------------------------------------------------------------------
// Short score (TECH_DESIGN 4.3)
// ---------------------------------------------------------------------------

export type ScoreCriterion = { id: string; weight: number; scaleMin: number; scaleMax: number };
export type SubmittedScores = { submitted: boolean; scores: { criterionId: string; score: number | null }[] };
export type ShortScore = { value: number | null; feedbackCount: number };

/**
 * Weighted average of all submitted scores of both interviewers. Every score
 * is first scaled to 0..1 on its own criterion's scale, the result is shown
 * on the scale of the first criterion (criteria in round order). Drafts do
 * not count. No submitted score → value null ("–").
 */
export function shortScore(criteria: ScoreCriterion[], feedback: SubmittedScores[]): ShortScore {
  const submitted = feedback.filter((f) => f.submitted);
  let sum = 0;
  let weights = 0;
  for (const f of submitted) {
    for (const s of f.scores) {
      const c = criteria.find((x) => x.id === s.criterionId);
      if (!c || s.score === null) continue;
      sum += ((s.score - c.scaleMin) / (c.scaleMax - c.scaleMin)) * c.weight;
      weights += c.weight;
    }
  }
  const first = criteria[0];
  if (!first || weights === 0) return { value: null, feedbackCount: submitted.length };
  return { value: first.scaleMin + (sum / weights) * (first.scaleMax - first.scaleMin), feedbackCount: submitted.length };
}

/** "3,8" with one decimal, "–" without a value. */
export function formatShortScore(value: number | null): string {
  if (value === null) return "–";
  return (Math.round(value * 10) / 10).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}


// ---------------------------------------------------------------------------
// Composition bar (TECH_DESIGN 4.3, Phase 16): cards on seats by cohort and
// by the departments given on the board.
// ---------------------------------------------------------------------------

export type CompositionCard = { applicantId: string; cohort: string };
/** Cards on a seat without a department given yet. */
export const NONE = "none";
export type Composition = {
  filled: number;
  seats: number;
  cohorts: { cohort: string; count: number }[];
  /** Every department of the round in order (also with 0), then NONE if it occurs. */
  departments: { key: string; count: number }[];
};

/**
 * Cards on seats, counted by cohort and by the departments the team gave
 * them (assigned: applicant id → department ids). A card with two
 * departments counts in both. The applicant's wish does not count here.
 */
export function composition(
  state: BoardState,
  seats: number,
  cards: CompositionCard[],
  assigned: ReadonlyMap<string, string[]>,
  departmentIds: string[],
): Composition {
  const seated = new Set(state.filter((p) => p.zone === "seat").map((p) => p.applicantId));
  const onSeats = cards.filter((c) => seated.has(c.applicantId));

  const cohorts = new Map<string, number>();
  for (const c of onSeats) cohorts.set(c.cohort, (cohorts.get(c.cohort) ?? 0) + 1);

  const departments = new Map<string, number>(departmentIds.map((id) => [id, 0]));
  let none = 0;
  for (const c of onSeats) {
    const ids = [...new Set(assigned.get(c.applicantId) ?? [])].filter((id) => departments.has(id));
    if (ids.length === 0) none++;
    for (const id of ids) departments.set(id, departments.get(id)! + 1);
  }

  return {
    filled: onSeats.length,
    seats,
    cohorts: [...cohorts].map(([cohort, count]) => ({ cohort, count })).sort((a, b) => a.cohort.localeCompare(b.cohort, "de")),
    departments: [...[...departments].map(([key, count]) => ({ key, count })), ...(none ? [{ key: NONE, count: none }] : [])],
  };
}
