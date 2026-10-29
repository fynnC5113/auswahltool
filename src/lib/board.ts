// Draft Board (Phase 16, Fynn 30.09.2026). Reads run with the member's
// session: RLS lets members read everything here, and once the selection
// round has started the sight lock is lifted for all submitted feedback.
// Writes go only through move_card, set_seats and set_board_departments,
// which check every rule again under the round's board lock and write the
// history (board_events).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardEvent, EventKind, Placement, Zone } from "@/lib/board-rules";
import { boardState, poolOrder, shortScore } from "@/lib/board-rules";

export type BoardDepartment = { id: string; name: string; short: string };
export type BoardCriterion = { id: string; name: string; weight: number; scaleMin: number; scaleMax: number };
export type BoardFeedback = {
  name: string;
  /** Only submitted entries; scores in criteria order. */
  overall: string;
  scores: { score: number | null; text: string }[];
};

export type BoardCard = {
  id: string;
  name: string;
  email: string;
  cohort: string;
  /** Departments chosen in the application, in round order. */
  wish: string[];
  wishAll: boolean;
  noShow: boolean;
  score: number | null;
  hasCv: boolean;
  answers: { question: string; text: string }[];
  /** Interviewers of the booked slot. */
  interviewers: string[];
  feedback: BoardFeedback[];
};

export type Board = {
  roundId: string;
  title: string;
  seats: number;
  /** Selection round started and board not frozen. */
  active: boolean;
  frozen: boolean;
  departments: BoardDepartment[];
  criteria: BoardCriterion[];
  cards: BoardCard[];
  placements: Placement[];
  /** Applicant id → departments given on the board. */
  assigned: Record<string, string[]>;
  /** The history in order, oldest first (Phase 17). */
  history: HistoryItem[];
  frozenAt: string | null;
  frozenBy: string | null;
};

/** A history entry with who and when. */
export type HistoryItem = BoardEvent & { actorId: string | null; actorName: string; at: string };

type RoundRow = {
  id: string;
  title: string;
  seats: number;
  selection_started_at: string | null;
  board_frozen_at: string | null;
  board_frozen_by: string | null;
  questions: { id: string; position: number; text: string }[];
  departments: { id: string; position: number; name: string; short_name: string }[];
  criteria: { id: string; position: number; name: string; weight: number; scale_min: number; scale_max: number }[];
};

type ApplicantRow = {
  id: string;
  name: string;
  email: string;
  cohort: string;
  department_all: boolean;
  status: "active" | "no_show";
  cv_path: string | null;
  answers: { question_id: string; text: string }[];
  applicant_departments: { department_id: string }[];
};

type FeedbackRow = {
  applicant_id: string;
  member_id: string;
  submitted_at: string | null;
  overall_text: string;
  feedback_scores: { criterion_id: string; score: number | null; text: string }[];
};

const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position);

/** Short name for the board, the full name when none is set. */
export const shortName = (d: { name: string; short: string }) => d.short || d.name;

/** The board of the newest round (or roundId); null = no round yet. */
export async function loadBoard(session: SupabaseClient, roundId?: string, now = new Date()): Promise<Board | null> {
  let query = session
    .from("rounds")
    .select(
      `id, title, seats, selection_started_at, board_frozen_at, board_frozen_by,
       questions (id, position, text), departments (id, position, name, short_name),
       criteria (id, position, name, weight, scale_min, scale_max)`,
    );
  if (roundId) query = query.eq("id", roundId);
  const { data: round, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle<RoundRow>();
  if (error) throw new Error(error.message);
  if (!round) return null;

  const started = !!round.selection_started_at && new Date(round.selection_started_at) <= now;
  const frozen = !!round.board_frozen_at;
  const departments = byPosition(round.departments).map((d) => ({ id: d.id, name: d.name, short: d.short_name }));
  const criteria = byPosition(round.criteria).map((c) => ({
    id: c.id,
    name: c.name,
    weight: Number(c.weight),
    scaleMin: c.scale_min,
    scaleMax: c.scale_max,
  }));
  const board: Board = {
    roundId: round.id,
    title: round.title,
    seats: round.seats,
    active: started && !frozen,
    frozen,
    departments,
    criteria,
    cards: [],
    placements: [],
    assigned: {},
    history: [],
    frozenAt: round.board_frozen_at,
    frozenBy: null,
  };
  // Before the start the short scores would differ from member to member
  // (sight lock), so the board shows nothing.
  if (!started) return board;

  const [applicants, feedback, slots, positions, assigned, members, events] = await Promise.all([
    session
      .from("applicants")
      .select("id, name, email, cohort, department_all, status, cv_path, answers (question_id, text), applicant_departments (department_id)")
      .eq("round_id", round.id)
      .returns<ApplicantRow[]>(),
    session
      .from("feedback")
      .select("applicant_id, member_id, submitted_at, overall_text, feedback_scores (criterion_id, score, text), applicants!inner (round_id)")
      .eq("applicants.round_id", round.id)
      .not("submitted_at", "is", null)
      .returns<FeedbackRow[]>(),
    session
      .from("slots")
      .select("applicant_id, interviewer_a, interviewer_b")
      .eq("round_id", round.id)
      .not("applicant_id", "is", null)
      .returns<{ applicant_id: string; interviewer_a: string | null; interviewer_b: string | null }[]>(),
    session
      .from("board_positions")
      .select("applicant_id, zone, position")
      .eq("round_id", round.id)
      .returns<{ applicant_id: string; zone: Zone; position: number | null }[]>(),
    session
      .from("board_departments")
      .select("applicant_id, department_id")
      .eq("round_id", round.id)
      .returns<{ applicant_id: string; department_id: string }[]>(),
    session.from("team_members").select("id, name").returns<{ id: string; name: string }[]>(),
    session
      .from("board_events")
      .select(
        "id, kind, applicant_id, actor_id, from_zone, from_position, to_zone, to_position, from_seats, to_seats, from_department_ids, to_department_ids, undoes_event_id, created_at",
      )
      .eq("round_id", round.id)
      .order("seq")
      .returns<EventRow[]>(),
  ]);
  for (const r of [applicants, feedback, slots, positions, assigned, members, events]) if (r.error) throw new Error(r.error.message);

  const nameOf = new Map(members.data!.map((m) => [m.id, m.name]));
  const questions = byPosition(round.questions);
  const deptOrder = new Map(departments.map((d, i) => [d.id, i]));

  board.cards = applicants
    .data!.map((a) => {
      const entries = feedback.data!.filter((f) => f.applicant_id === a.id);
      const slot = slots.data!.find((s) => s.applicant_id === a.id);
      const text = new Map(a.answers.map((x) => [x.question_id, x.text]));
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        cohort: a.cohort,
        wish: a.applicant_departments
          .map((d) => d.department_id)
          .filter((id) => deptOrder.has(id))
          .sort((x, y) => deptOrder.get(x)! - deptOrder.get(y)!),
        wishAll: a.department_all,
        noShow: a.status === "no_show",
        score: shortScore(
          criteria,
          entries.map((f) => ({
            submitted: true,
            scores: f.feedback_scores.map((s) => ({ criterionId: s.criterion_id, score: s.score })),
          })),
        ).value,
        hasCv: !!a.cv_path,
        answers: questions.map((q) => ({ question: q.text, text: text.get(q.id) ?? "" })),
        interviewers: [slot?.interviewer_a, slot?.interviewer_b]
          .filter((m): m is string => !!m)
          .map((m) => nameOf.get(m) ?? "Unbekannt"),
        feedback: entries
          .map((f) => ({
            name: nameOf.get(f.member_id) ?? "Unbekannt",
            overall: f.overall_text,
            scores: criteria.map((c) => {
              const s = f.feedback_scores.find((x) => x.criterion_id === c.id);
              return { score: s?.score ?? null, text: s?.text ?? "" };
            }),
          }))
          .sort((x, y) => x.name.localeCompare(y.name, "de")),
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name, "de"));

  board.placements = positions.data!.map((p) => ({ applicantId: p.applicant_id, zone: p.zone, position: p.position }));
  for (const row of assigned.data!) (board.assigned[row.applicant_id] ??= []).push(row.department_id);
  for (const ids of Object.values(board.assigned)) ids.sort((x, y) => (deptOrder.get(x) ?? 0) - (deptOrder.get(y) ?? 0));
  board.history = events.data!.map((e) => ({
    id: e.id,
    kind: e.kind,
    applicantId: e.applicant_id,
    fromZone: e.from_zone,
    fromPosition: e.from_position,
    toZone: e.to_zone,
    toPosition: e.to_position,
    fromSeats: e.from_seats,
    toSeats: e.to_seats,
    fromDepartments: e.from_department_ids,
    toDepartments: e.to_department_ids,
    undoes: e.undoes_event_id,
    actorId: e.actor_id,
    actorName: (e.actor_id && nameOf.get(e.actor_id)) || "Unbekannt",
    at: e.created_at,
  }));
  board.frozenBy = round.board_frozen_by ? (nameOf.get(round.board_frozen_by) ?? "Unbekannt") : null;
  return board;
}

type EventRow = {
  id: string;
  kind: EventKind;
  applicant_id: string | null;
  actor_id: string | null;
  from_zone: Zone | null;
  from_position: number | null;
  to_zone: Zone | null;
  to_position: number | null;
  from_seats: number | null;
  to_seats: number | null;
  from_department_ids: string[] | null;
  to_department_ids: string[] | null;
  undoes_event_id: string | null;
  created_at: string;
};

/** The pool as the board shows it (stored places first, then by short score and name). */
export function boardPool(board: Board): string[] {
  const cards = new Map(board.cards.map((c) => [c.id, c]));
  return poolOrder(boardState(board.cards.map((c) => c.id), board.placements), (id) => ({
    score: cards.get(id)?.score ?? null,
    name: cards.get(id)?.name ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Result (Phase 17): after freezing, three groups with names and addresses.
// ---------------------------------------------------------------------------

export type ResultPerson = { id: string; name: string; email: string; noShow: boolean };
export type BoardResultGroups = {
  /** Seats in number order, with the departments given on the board. */
  accepted: (ResultPerson & { seat: number; departments: BoardDepartment[] })[];
  /** The pool in its order. */
  waiting: ResultPerson[];
  /** "Nicht aufnehmen", by name. */
  rejected: ResultPerson[];
};

export function boardResult(board: Board): BoardResultGroups {
  const cards = new Map(board.cards.map((c) => [c.id, c]));
  const person = (id: string): ResultPerson => {
    const c = cards.get(id)!;
    return { id, name: c.name, email: c.email, noShow: c.noShow };
  };
  const state = boardState(board.cards.map((c) => c.id), board.placements);
  const dept = new Map(board.departments.map((d) => [d.id, d]));
  return {
    accepted: state
      .filter((p) => p.zone === "seat")
      .sort((a, b) => a.position! - b.position!)
      .map((p) => ({
        ...person(p.applicantId),
        seat: p.position!,
        departments: (board.assigned[p.applicantId] ?? []).map((id) => dept.get(id)).filter((d): d is BoardDepartment => !!d),
      })),
    waiting: boardPool(board).map(person),
    rejected: state
      .filter((p) => p.zone === "reject")
      .map((p) => person(p.applicantId))
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type BoardResult = { ok: true } | { error: string };

const RELOAD = "Das Board hat sich inzwischen geändert. Bitte lade die Seite neu.";

function message(
  error: { hint?: string | null; details?: string | null; message: string },
  what: "move" | "seats" | "departments" | "undo" | "freeze",
): string {
  switch (error.hint) {
    case "not_member":
      return "Dein Zugang ist nicht (mehr) freigeschaltet.";
    case "not_admin":
      return what === "freeze" ? "Einfrieren und Aufheben dürfen nur Admins." : "Die Zahl der Plätze ändern nur Admins.";
    case "frozen":
      return "Das Board ist eingefroren. Es lässt sich nichts mehr verschieben.";
    case "not_started":
      return "Das Board öffnet mit der Auswahlrunde.";
    case "seat_taken":
      if (what === "undo") return `Platz ${error.details} ist jetzt belegt. Rückgängig geht nicht mehr.`;
      return what === "seats"
        ? `Platz ${error.details} ist belegt. Nur ein leerer letzter Platz lässt sich wegnehmen.`
        : `Platz ${error.details} ist belegt. Nimm einen freien Platz.`;
    case "minimum":
      return "Mindestens ein Platz bleibt.";
    case "too_many":
      return "Höchstens zwei Ressorts pro Person.";
    case "not_seated":
      return what === "undo" ? "Die Karte ist nicht mehr auf einem Platz. Rückgängig geht nicht mehr." : "Ein Ressort gibt es nur für Karten auf einem Platz.";
    case "already_undone":
      return "Das ist schon rückgängig gemacht.";
    case "moved_since":
      return "Die Karte wurde seitdem bewegt. Rückgängig geht nicht mehr.";
    case "changed_since":
      return "Das wurde seitdem geändert. Rückgängig geht nicht mehr.";
    case "origin_gone":
      return `Platz ${error.details} gibt es nicht mehr. Rückgängig geht nicht mehr.`;
    case "not_undoable":
      return "Das lässt sich nicht rückgängig machen.";
    case "not_frozen":
      return "Das Board ist nicht eingefroren.";
    case "unknown_event":
    case "unknown_applicant":
    case "seat_missing":
    case "department_unknown":
    case "pool_missing":
    case "stale":
      return RELOAD;
  }
  throw new Error(error.message);
}

/** Moves a card. pool: the pool in the order the member sees it, before the move. */
export async function moveCard(
  session: SupabaseClient,
  applicantId: string,
  zone: Zone,
  position: number | null,
  pool: string[],
): Promise<BoardResult> {
  const { error } = await session.rpc("move_card", {
    p_applicant_id: applicantId,
    p_to_zone: zone,
    p_to_position: position,
    p_pool: pool,
  });
  return error ? { error: message(error, "move") } : { ok: true };
}

/** "+" / "−" for the number of seats (admins). */
export async function setSeats(session: SupabaseClient, roundId: string, delta: 1 | -1): Promise<BoardResult> {
  const { error } = await session.rpc("set_seats", { p_round_id: roundId, p_delta: delta });
  return error ? { error: message(error, "seats") } : { ok: true };
}

/** One or two departments for a card on a seat; [] removes them. */
export async function setBoardDepartments(session: SupabaseClient, applicantId: string, departmentIds: string[]): Promise<BoardResult> {
  const { error } = await session.rpc("set_board_departments", { p_applicant_id: applicantId, p_department_ids: departmentIds });
  return error ? { error: message(error, "departments") } : { ok: true };
}

/** "Rückgängig" in the history. pool: the pool as the member sees it. */
export async function undoEvent(session: SupabaseClient, eventId: string, pool: string[]): Promise<BoardResult> {
  const { error } = await session.rpc("undo_board_event", { p_event_id: eventId, p_pool: pool });
  return error ? { error: message(error, "undo") } : { ok: true };
}

/** Admins freeze the board; afterwards nothing can change until the freeze is lifted. */
export async function freezeBoard(session: SupabaseClient, roundId: string): Promise<BoardResult> {
  const { error } = await session.rpc("freeze_board", { p_round_id: roundId });
  return error ? { error: message(error, "freeze") } : { ok: true };
}

/** Admins lift the freeze (Fynn, 30.09.2026: against a click by mistake). */
export async function unfreezeBoard(session: SupabaseClient, roundId: string): Promise<BoardResult> {
  const { error } = await session.rpc("unfreeze_board", { p_round_id: roundId });
  return error ? { error: message(error, "freeze") } : { ok: true };
}
