// Board rules without a database (Phase 15, Fynn 29.09.2026): short score,
// composition bar, moving a card, undo and changing the number of seats.
//
// Seats are fixed boxes 1..N (decision B): a card keeps its seat number until
// someone moves that card, a freed seat stays empty. Dropping on a taken seat
// is rejected, "−" removes only the last seat and only while it is empty.
// "Auch gern" is an ordered list without gaps. Pool and "Nicht aufnehmen"
// have no position. The database checks the same rules again (Phase 16/17).

export type Zone = "pool" | "seat" | "also" | "reject";
export type Placement = { applicantId: string; zone: Zone; position: number | null };
/** One placement per applicant. */
export type BoardState = Placement[];

/** Board state for these applicants; applicants without a stored row start in the pool. */
export function boardState(applicantIds: string[], stored: Placement[]): BoardState {
  return applicantIds.map((id) => {
    const p = stored.find((s) => s.applicantId === id);
    return p ? { ...p, position: hasPosition(p.zone) ? p.position : null } : { applicantId: id, zone: "pool", position: null };
  });
}

function hasPosition(zone: Zone): boolean {
  return zone === "seat" || zone === "also";
}

/** Seat numbers 1..seats without a card. */
export function freeSeats(state: BoardState, seats: number): number[] {
  const taken = new Set(state.filter((p) => p.zone === "seat").map((p) => p.position));
  return Array.from({ length: seats }, (_, i) => i + 1).filter((n) => !taken.has(n));
}

/** "Auch gern" in order. */
export function alsoList(state: BoardState): Placement[] {
  return state.filter((p) => p.zone === "also").sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
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
  | "moved_since" // undo: the card is no longer where the entry put it
  | "origin_gone"; // undo: the old seat no longer exists

export type MoveResult = { ok: true; state: BoardState; move: Move } | { ok: false; error: MoveError; position?: number };

/**
 * Moves one card. Seat: a free seat 1..seats. "Auch gern": insert at the
 * given position (default: end), the list is renumbered 1, 2, 3 … Pool and
 * reject: no position. Only the moved card and, in "Auch gern", the
 * renumbered cards change.
 */
export function moveCard(state: BoardState, seats: number, applicantId: string, target: Target): MoveResult {
  const card = state.find((p) => p.applicantId === applicantId);
  if (!card) return { ok: false, error: "unknown_applicant" };

  let toPosition: number | null = null;
  if (target.zone === "seat") {
    const n = target.position;
    if (n == null || !Number.isInteger(n) || n < 1 || n > seats) return { ok: false, error: "seat_missing", position: n ?? undefined };
    if (card.zone === "seat" && card.position === n) return { ok: false, error: "unchanged" };
    if (state.some((p) => p.zone === "seat" && p.position === n)) return { ok: false, error: "seat_taken", position: n };
    toPosition = n;
  } else if (target.zone === "also") {
    const others = alsoList(state).filter((p) => p.applicantId !== applicantId);
    const wanted = target.position ?? others.length + 1;
    toPosition = Math.min(Math.max(1, Math.trunc(wanted)), others.length + 1);
    if (card.zone === "also" && card.position === toPosition) return { ok: false, error: "unchanged" };
  } else if (card.zone === target.zone) {
    return { ok: false, error: "unchanged" };
  }

  const move: Move = {
    applicantId,
    fromZone: card.zone,
    fromPosition: card.position,
    toZone: target.zone,
    toPosition,
  };
  return { ok: true, state: apply(state, move), move };
}

function apply(state: BoardState, move: Move): BoardState {
  const moved: Placement = { applicantId: move.applicantId, zone: move.toZone, position: move.toPosition };
  const rest = state.filter((p) => p.applicantId !== move.applicantId);
  const also = alsoList(rest);
  if (move.toZone === "also") also.splice((move.toPosition ?? also.length + 1) - 1, 0, moved);
  const alsoPositions = new Map(also.map((p, i) => [p.applicantId, i + 1]));
  return state.map((p) => {
    const q = p.applicantId === move.applicantId ? moved : p;
    return q.zone === "also" ? { ...q, position: alsoPositions.get(q.applicantId) ?? null } : q;
  });
}

/** A stored history entry (board_events), history in chronological order. */
export type HistoryEntry = Move & { id: string };

/**
 * Undo of a history entry: moves the card back where it came from and
 * returns that as a new move (stored with undoes_event_id). Rejected if the
 * card has been moved since (a later entry for the same card, also an undo),
 * or if its old seat is taken or no longer exists. Undoing an undo moves the
 * card forward again under the same rules.
 */
export function undoMove(state: BoardState, seats: number, history: HistoryEntry[], entryId: string): MoveResult {
  const index = history.findIndex((e) => e.id === entryId);
  if (index < 0) return { ok: false, error: "unknown_entry" };
  const entry = history[index];
  const card = state.find((p) => p.applicantId === entry.applicantId);
  if (!card) return { ok: false, error: "unknown_applicant" };
  const movedLater = history.slice(index + 1).some((e) => e.applicantId === entry.applicantId);
  const stillThere =
    card.zone === entry.toZone && (entry.toZone !== "seat" || card.position === entry.toPosition);
  if (movedLater || !stillThere) return { ok: false, error: "moved_since" };
  if (entry.fromZone === "seat" && (entry.fromPosition ?? 0) > seats) {
    return { ok: false, error: "origin_gone", position: entry.fromPosition ?? undefined };
  }
  return moveCard(state, seats, entry.applicantId, { zone: entry.fromZone, position: entry.fromPosition });
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
// Composition bar (TECH_DESIGN 4.3)
// ---------------------------------------------------------------------------

export type CompositionCard = {
  applicantId: string;
  cohort: string;
  departmentIds: string[];
  departmentUnsure: boolean;
  departmentAll: boolean;
};
export const ALL = "all";
export const UNSURE = "unsure";
export const NONE = "none";
export type Composition = {
  filled: number;
  seats: number;
  cohorts: { cohort: string; count: number }[];
  /** Every department of the round in order (also with 0), then ALL, UNSURE and NONE if they occur. */
  departments: { key: string; count: number }[];
};

/**
 * Cards on seats, counted by cohort and by preferred department. A card
 * with several departments counts in each; "für alle Ressorts offen" is ALL
 * (its own entry, not counted in every department), "weiß ich noch nicht" is UNSURE,
 * no choice at all (possible when an admin enters the application) is NONE.
 */
export function composition(
  state: BoardState,
  seats: number,
  cards: CompositionCard[],
  departmentIds: string[],
): Composition {
  const seated = new Set(state.filter((p) => p.zone === "seat").map((p) => p.applicantId));
  const onSeats = cards.filter((c) => seated.has(c.applicantId));

  const cohorts = new Map<string, number>();
  for (const c of onSeats) cohorts.set(c.cohort, (cohorts.get(c.cohort) ?? 0) + 1);

  const departments = new Map<string, number>(departmentIds.map((id) => [id, 0]));
  let all = 0;
  let unsure = 0;
  let none = 0;
  for (const c of onSeats) {
    if (c.departmentAll) all++;
    else if (c.departmentUnsure) unsure++;
    else if (c.departmentIds.length === 0) none++;
    for (const id of new Set(c.departmentIds)) departments.set(id, (departments.get(id) ?? 0) + 1);
  }

  return {
    filled: onSeats.length,
    seats,
    cohorts: [...cohorts].map(([cohort, count]) => ({ cohort, count })).sort((a, b) => a.cohort.localeCompare(b.cohort, "de")),
    departments: [
      ...[...departments].map(([key, count]) => ({ key, count })),
      ...(all ? [{ key: ALL, count: all }] : []),
      ...(unsure ? [{ key: UNSURE, count: unsure }] : []),
      ...(none ? [{ key: NONE, count: none }] : []),
    ],
  };
}
