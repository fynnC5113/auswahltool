// Meine Gespräche and feedback (Phase 14, Fynn 29.09.2026). Reads run with
// the member's session, so the sight lock (RLS) decides what is visible.
// Writes go through public.save_feedback (only the interviewers, from the
// start of the interview, complete on submission); lifting the lock and
// starting the selection round are admin updates under RLS.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/auth/member";
import { roomLabel } from "@/lib/calendar-mail";
import {
  missingFeedback,
  ownState,
  type Criterion,
  type FeedbackInput,
  type MissingEntry,
  type OwnState,
  type Progress,
} from "@/lib/feedback-rules";

const NOT_ALLOWED = { error: "Das dürfen nur Admins." } as const;
const NO_MEMBER = { error: "Dein Zugang ist nicht (mehr) freigeschaltet." } as const;

type RoundRow = { id: string; title: string; selection_started_at: string | null; board_frozen_at: string | null };

async function newestRound(session: SupabaseClient, roundId?: string): Promise<RoundRow | null> {
  let query = session.from("rounds").select("id, title, selection_started_at, board_frozen_at");
  if (roundId) query = query.eq("id", roundId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle<RoundRow>();
  if (error) throw new Error(error.message);
  return data;
}

async function loadCriteria(session: SupabaseClient, roundId: string): Promise<Criterion[]> {
  const { data, error } = await session
    .from("criteria")
    .select("id, name, description, scale_min, scale_max")
    .eq("round_id", roundId)
    .order("position")
    .returns<{ id: string; name: string; description: string | null; scale_min: number; scale_max: number }[]>();
  if (error) throw new Error(error.message);
  return data.map((c) => ({ id: c.id, name: c.name, description: c.description ?? "", scaleMin: c.scale_min, scaleMax: c.scale_max }));
}

async function teamNames(session: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await session.from("team_members").select("id, name");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((m) => [m.id as string, m.name as string]));
}

async function loadProgress(session: SupabaseClient, roundId: string): Promise<Progress[]> {
  const { data, error } = await session.rpc("feedback_progress", { p_round_id: roundId });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { applicant_id: string; member_id: string; submitted: boolean }[];
  return rows.map((p) => ({ applicantId: p.applicant_id, memberId: p.member_id, submitted: p.submitted }));
}

type InterviewRow = {
  id: string;
  applicant_id: string;
  starts_at: string;
  interview_ends_at: string;
  interviewer_a: string;
  interviewer_b: string;
  locations: { name: string } | null;
  applicants: { name: string; status: "active" | "no_show"; sight_lock_lifted: boolean } | null;
};

const INTERVIEW_COLUMNS =
  "id, applicant_id, starts_at, interview_ends_at, interviewer_a, interviewer_b, locations (name), applicants (name, status, sight_lock_lifted)";

// ---------------------------------------------------------------------------
// Meine Gespräche
// ---------------------------------------------------------------------------

export type MyInterview = {
  slotId: string;
  applicantId: string;
  applicantName: string;
  startsAt: string;
  interviewEndsAt: string;
  location: string;
  partner: string;
  noShow: boolean;
  own: OwnState;
};

/** The signed-in member's booked interviews in the newest round, by start. */
export async function loadMyInterviews(
  session: SupabaseClient,
  roundId?: string,
): Promise<{ title: string; interviews: MyInterview[] } | null> {
  const { member } = await getMember(session);
  if (!member) return null;
  const round = await newestRound(session, roundId);
  if (!round) return null;

  const [slots, own, names] = await Promise.all([
    session
      .from("slots")
      .select(INTERVIEW_COLUMNS)
      .eq("round_id", round.id)
      .not("applicant_id", "is", null)
      .or(`interviewer_a.eq.${member.id},interviewer_b.eq.${member.id}`)
      .order("starts_at")
      .returns<InterviewRow[]>(),
    session
      .from("feedback")
      .select("applicant_id, submitted_at")
      .eq("member_id", member.id)
      .returns<{ applicant_id: string; submitted_at: string | null }[]>(),
    teamNames(session),
  ]);
  if (slots.error) throw new Error(slots.error.message);
  if (own.error) throw new Error(own.error.message);

  return {
    title: round.title,
    interviews: slots.data.map((s) => {
      const entry = own.data.find((f) => f.applicant_id === s.applicant_id);
      const partner = s.interviewer_a === member.id ? s.interviewer_b : s.interviewer_a;
      return {
        slotId: s.id,
        applicantId: s.applicant_id,
        applicantName: s.applicants?.name ?? "",
        startsAt: s.starts_at,
        interviewEndsAt: s.interview_ends_at,
        location: roomLabel(s.locations?.name ?? ""),
        partner: names.get(partner) ?? "Unbekannt",
        noShow: s.applicants?.status === "no_show",
        own: ownState(entry && { submitted: !!entry.submitted_at }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Feedback form
// ---------------------------------------------------------------------------

export type FeedbackForm = {
  interview: MyInterview;
  criteria: Criterion[];
  input: FeedbackInput;
  submittedAt: string | null;
  frozen: boolean;
};

/** The form for one of the member's own slots; null = not theirs or gone. */
export async function loadFeedbackForm(session: SupabaseClient, slotId: string): Promise<FeedbackForm | null> {
  if (!/^[0-9a-f-]{36}$/i.test(slotId)) return null;
  const { member } = await getMember(session);
  if (!member) return null;
  const { data: slot, error } = await session
    .from("slots")
    .select(`round_id, ${INTERVIEW_COLUMNS}`)
    .eq("id", slotId)
    .maybeSingle<InterviewRow & { round_id: string }>();
  if (error) throw new Error(error.message);
  if (!slot?.applicant_id || ![slot.interviewer_a, slot.interviewer_b].includes(member.id)) return null;

  const [round, criteria, entry, names] = await Promise.all([
    newestRound(session, slot.round_id),
    loadCriteria(session, slot.round_id),
    session
      .from("feedback")
      .select("overall_text, submitted_at, feedback_scores (criterion_id, score, text)")
      .eq("applicant_id", slot.applicant_id)
      .eq("member_id", member.id)
      .maybeSingle<{
        overall_text: string;
        submitted_at: string | null;
        feedback_scores: { criterion_id: string; score: number | null; text: string }[];
      }>(),
    teamNames(session),
  ]);
  if (entry.error) throw new Error(entry.error.message);
  const e = entry.data;
  const partner = slot.interviewer_a === member.id ? slot.interviewer_b : slot.interviewer_a;

  return {
    interview: {
      slotId: slot.id,
      applicantId: slot.applicant_id,
      applicantName: slot.applicants?.name ?? "",
      startsAt: slot.starts_at,
      interviewEndsAt: slot.interview_ends_at,
      location: roomLabel(slot.locations?.name ?? ""),
      partner: names.get(partner) ?? "Unbekannt",
      noShow: slot.applicants?.status === "no_show",
      own: ownState(e ? { submitted: !!e.submitted_at } : undefined),
    },
    criteria,
    input: {
      overall: e?.overall_text ?? "",
      scores: criteria.map((c) => {
        const s = e?.feedback_scores.find((x) => x.criterion_id === c.id);
        return { criterionId: c.id, score: s?.score ?? null, text: s?.text ?? "" };
      }),
    },
    submittedAt: e?.submitted_at ?? null,
    frozen: !!round?.board_frozen_at,
  };
}

export type SaveResult = { ok: true; submittedAt: string | null } | { error: string; missing?: string[] };

const SAVE_ERRORS: Record<string, string> = {
  not_member: NO_MEMBER.error,
  not_interviewer: "Du bist für dieses Gespräch nicht (mehr) eingeteilt.",
  not_started: "Feedback kannst du ab Gesprächsbeginn eintragen.",
  frozen: "Das Board ist eingefroren. Feedback lässt sich nicht mehr ändern.",
  criterion_unknown: "Die Kriterien der Runde haben sich geändert. Bitte Seite neu laden.",
};

/** Saves the own entry; submit = true submits it (once; it stays submitted). */
export async function saveFeedback(
  session: SupabaseClient,
  applicantId: string,
  input: FeedbackInput,
  submit: boolean,
): Promise<SaveResult> {
  const { data, error } = await session.rpc("save_feedback", {
    p_applicant_id: applicantId,
    p_overall: input.overall,
    p_scores: input.scores.map((s) => ({ criterion_id: s.criterionId, score: s.score, text: s.text })),
    p_submit: submit,
  });
  if (error) {
    if (error.hint === "incomplete") {
      return {
        error: submit
          ? "Bitte fülle die markierten Felder aus."
          : "Nicht gespeichert: Ein abgegebenes Feedback muss vollständig bleiben.",
        missing: (error.details ?? "").split(", ").filter(Boolean),
      };
    }
    const message = error.hint ? SAVE_ERRORS[error.hint] : undefined;
    if (message) return { error: message };
    throw new Error(error.message);
  }
  return { ok: true, submittedAt: (data as string | null) ?? null };
}

// ---------------------------------------------------------------------------
// Feedback on /bewerbungen/[id]
// ---------------------------------------------------------------------------

export type FeedbackEntry = {
  memberId: string;
  name: string;
  submittedAt: string | null;
  overall: string;
  scores: { criterionId: string; score: number | null; text: string }[];
};

export type ApplicantFeedback = {
  criteria: Criterion[];
  /** Entries the member may read: own (also a draft) and released ones. */
  entries: FeedbackEntry[];
  lifted: boolean;
  selectionStartedAt: string | null;
};

export async function loadApplicantFeedback(
  session: SupabaseClient,
  applicantId: string,
  roundId: string,
): Promise<ApplicantFeedback> {
  const [criteria, entries, applicant, round, names] = await Promise.all([
    loadCriteria(session, roundId),
    session
      .from("feedback")
      .select("member_id, overall_text, submitted_at, feedback_scores (criterion_id, score, text)")
      .eq("applicant_id", applicantId)
      .returns<
        {
          member_id: string;
          overall_text: string;
          submitted_at: string | null;
          feedback_scores: { criterion_id: string; score: number | null; text: string }[];
        }[]
      >(),
    session.from("applicants").select("sight_lock_lifted").eq("id", applicantId).maybeSingle<{ sight_lock_lifted: boolean }>(),
    newestRound(session, roundId),
    teamNames(session),
  ]);
  if (entries.error) throw new Error(entries.error.message);
  if (applicant.error) throw new Error(applicant.error.message);

  return {
    criteria,
    entries: entries.data
      .map((e) => ({
        memberId: e.member_id,
        name: names.get(e.member_id) ?? "Unbekannt",
        submittedAt: e.submitted_at,
        overall: e.overall_text,
        scores: criteria.map((c) => {
          const s = e.feedback_scores.find((x) => x.criterion_id === c.id);
          return { criterionId: c.id, score: s?.score ?? null, text: s?.text ?? "" };
        }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
    lifted: !!applicant.data?.sight_lock_lifted,
    selectionStartedAt: round?.selection_started_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Overview: missing feedback, lifting the lock, starting the selection round
// ---------------------------------------------------------------------------

export type MissingRow = {
  applicantId: string;
  applicantName: string;
  startsAt: string;
  lifted: boolean;
  missing: { name: string; draft: boolean }[];
};

/** Ended interviews with missing feedback, by start; count = missing entries. */
export async function loadMissingFeedback(
  session: SupabaseClient,
  roundId: string,
  now = new Date(),
): Promise<{ count: number; rows: MissingRow[] }> {
  const [slots, progress, names] = await Promise.all([
    session
      .from("slots")
      .select(INTERVIEW_COLUMNS)
      .eq("round_id", roundId)
      .not("applicant_id", "is", null)
      .order("starts_at")
      .returns<InterviewRow[]>(),
    loadProgress(session, roundId),
    teamNames(session),
  ]);
  if (slots.error) throw new Error(slots.error.message);

  const missing: MissingEntry[] = missingFeedback(
    slots.data.map((s) => ({
      applicantId: s.applicant_id,
      interviewers: [s.interviewer_a, s.interviewer_b],
      interviewEndsAt: s.interview_ends_at,
      noShow: s.applicants?.status === "no_show",
    })),
    progress,
    now,
  );
  const rows = slots.data
    .filter((s) => missing.some((m) => m.applicantId === s.applicant_id))
    .map((s) => ({
      applicantId: s.applicant_id,
      applicantName: s.applicants?.name ?? "",
      startsAt: s.starts_at,
      lifted: !!s.applicants?.sight_lock_lifted,
      missing: missing
        .filter((m) => m.applicantId === s.applicant_id)
        .map((m) => ({ name: names.get(m.memberId) ?? "Unbekannt", draft: m.state === "draft" })),
    }));
  return { count: missing.length, rows };
}

export type AdminResult = { ok: true } | { error: string };

/** "Sperre aufheben" for one applicant (PRD 4.5). Admins only. */
export async function liftSightLock(session: SupabaseClient, applicantId: string): Promise<AdminResult> {
  const { member } = await getMember(session);
  if (member?.role !== "admin") return NOT_ALLOWED;
  const { data, error } = await session.from("applicants").update({ sight_lock_lifted: true }).eq("id", applicantId).select("id");
  if (error) throw new Error(error.message);
  return data.length ? { ok: true } : { error: "Diese Bewerbung gibt es nicht mehr. Bitte Seite neu laden." };
}

/** "Auswahlrunde starten": the sight lock ends for everyone (undo: stopSelection). */
export async function startSelection(session: SupabaseClient, roundId: string): Promise<AdminResult> {
  const { member } = await getMember(session);
  if (member?.role !== "admin") return NOT_ALLOWED;
  const { data, error } = await session
    .from("rounds")
    .update({ selection_started_at: new Date().toISOString() })
    .eq("id", roundId)
    .is("selection_started_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return data.length ? { ok: true } : { error: "Die Auswahlrunde läuft schon." };
}

/**
 * "Auswahlrunde zurücknehmen" (Fynn, 29.09.2026: for a start by mistake):
 * the sight lock applies again; locks lifted one by one stay lifted. Only
 * while the board is not frozen.
 */
export async function stopSelection(session: SupabaseClient, roundId: string): Promise<AdminResult> {
  const { member } = await getMember(session);
  if (member?.role !== "admin") return NOT_ALLOWED;
  const { data, error } = await session
    .from("rounds")
    .update({ selection_started_at: null })
    .eq("id", roundId)
    .not("selection_started_at", "is", null)
    .is("board_frozen_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return data.length ? { ok: true } : { error: "Die Auswahlrunde läuft nicht, oder das Board ist schon eingefroren." };
}
