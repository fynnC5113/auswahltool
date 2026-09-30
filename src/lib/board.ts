// Draft Board (Phase 16, Fynn 30.09.2026). Reads run with the member's
// session: RLS lets members read everything here, and once the selection
// round has started the sight lock is lifted for all submitted feedback.
// Writes go only through move_card, set_seats and set_board_departments,
// which check every rule again under the round's board lock and write the
// history (board_events).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Placement, Zone } from "@/lib/board-rules";
import { shortScore } from "@/lib/board-rules";

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
};

type RoundRow = {
  id: string;
  title: string;
  seats: number;
  selection_started_at: string | null;
  board_frozen_at: string | null;
  questions: { id: string; position: number; text: string }[];
  departments: { id: string; position: number; name: string; short_name: string }[];
  criteria: { id: string; position: number; name: string; weight: number; scale_min: number; scale_max: number }[];
};

type ApplicantRow = {
  id: string;
  name: string;
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
      `id, title, seats, selection_started_at, board_frozen_at,
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
  };
  // Before the start the short scores would differ from member to member
  // (sight lock), so the board shows nothing.
  if (!started) return board;

  const [applicants, feedback, slots, positions, assigned, members] = await Promise.all([
    session
      .from("applicants")
      .select("id, name, cohort, department_all, status, cv_path, answers (question_id, text), applicant_departments (department_id)")
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
  ]);
  for (const r of [applicants, feedback, slots, positions, assigned, members]) if (r.error) throw new Error(r.error.message);

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
  return board;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type BoardResult = { ok: true } | { error: string };

const RELOAD = "Das Board hat sich inzwischen geändert. Bitte lade die Seite neu.";

function message(error: { hint?: string | null; details?: string | null; message: string }, what: "move" | "seats" | "departments"): string {
  switch (error.hint) {
    case "not_member":
      return "Dein Zugang ist nicht (mehr) freigeschaltet.";
    case "not_admin":
      return "Die Zahl der Plätze ändern nur Admins.";
    case "frozen":
      return "Das Board ist eingefroren. Es lässt sich nichts mehr verschieben.";
    case "not_started":
      return "Das Board öffnet mit der Auswahlrunde.";
    case "seat_taken":
      return what === "seats"
        ? `Platz ${error.details} ist belegt. Nur ein leerer letzter Platz lässt sich wegnehmen.`
        : `Platz ${error.details} ist belegt. Nimm einen freien Platz.`;
    case "minimum":
      return "Mindestens ein Platz bleibt.";
    case "too_many":
      return "Höchstens zwei Ressorts pro Person.";
    case "not_seated":
      return "Ein Ressort gibt es nur für Karten auf einem Platz.";
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
