// Applications in the team (Phase 13): list, detail, conflict of interest,
// status, CV link and the admin's deletion. Everything runs with the member's
// session, so RLS decides (members read; own conflicts; admins write).
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteApplicant, loadApplicationRound, type ApplicationRound, type Source } from "@/lib/application";
import type { ApplicantStatus, Searchable } from "@/lib/applicant-filter";
import { getMember } from "@/lib/auth/member";
import { roomLabel, type Deliver } from "@/lib/calendar-mail";
import { sendMail } from "@/lib/mail/send";

export type TeamResult = { ok: true } | { error: string };

const NOT_ALLOWED = { error: "Das dürfen nur Admins." } as const;
const NO_MEMBER = { error: "Dein Zugang ist nicht (mehr) freigeschaltet." } as const;
const GONE = { error: "Diese Bewerbung gibt es nicht mehr. Bitte Seite neu laden." } as const;
const BUCKET = "cv";
/** Seconds a CV link stays valid (like /b/[token]/lebenslauf). */
export const CV_LINK_SECONDS = 60;

type ApplicantRow = {
  id: string;
  round_id: string;
  name: string;
  email: string;
  cohort: string;
  department_all: boolean;
  status: ApplicantStatus;
  source: Source;
  cv_path: string | null;
  created_at: string;
  answers: { question_id: string; text: string }[];
  applicant_departments: { department_id: string }[];
};

const APPLICANT_COLUMNS = `id, round_id, name, email, cohort, department_all, status, source, cv_path, created_at,
  answers (question_id, text), applicant_departments (department_id)`;

type SlotRow = {
  id: string;
  applicant_id: string;
  starts_at: string;
  interview_ends_at: string;
  interviewer_a: string | null;
  interviewer_b: string | null;
  locations: { name: string } | null;
};

async function teamNames(session: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await session.from("team_members").select("id, name");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((m) => [m.id as string, m.name as string]));
}

function departmentNames(round: ApplicationRound, ids: string[]): string[] {
  return round.departments.filter((d) => ids.includes(d.id)).map((d) => d.name);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export type TeamListItem = Searchable & {
  id: string;
  /** Department names in round order. */
  departments: string[];
  /** Start of the booked slot, or null. */
  slotStartsAt: string | null;
  /** Names of members who marked a conflict of interest. */
  conflicts: string[];
};

export type TeamList = { round: ApplicationRound; items: TeamListItem[] };

/** Every application of the newest round (or roundId), by name. null = no round yet. */
export async function loadTeamList(session: SupabaseClient, roundId?: string): Promise<TeamList | null> {
  const round = await loadApplicationRound(session, roundId);
  if (!round) return null;

  const [applicants, slots, conflicts, names] = await Promise.all([
    session.from("applicants").select(APPLICANT_COLUMNS).eq("round_id", round.id).returns<ApplicantRow[]>(),
    session
      .from("slots")
      .select("applicant_id, starts_at")
      .eq("round_id", round.id)
      .not("applicant_id", "is", null)
      .returns<{ applicant_id: string; starts_at: string }[]>(),
    session
      .from("conflicts")
      .select("applicant_id, member_id, applicants!inner (round_id)")
      .eq("applicants.round_id", round.id)
      .returns<{ applicant_id: string; member_id: string }[]>(),
    teamNames(session),
  ]);
  for (const result of [applicants, slots, conflicts]) if (result.error) throw new Error(result.error.message);

  const slotOf = new Map(slots.data!.map((s) => [s.applicant_id, s.starts_at]));
  const items = applicants.data!.map((a) => {
    const text = new Map(a.answers.map((x) => [x.question_id, x.text]));
    const departmentIds = a.applicant_departments.map((d) => d.department_id);
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      cohort: a.cohort,
      departmentIds,
      departmentAll: a.department_all,
      departments: departmentNames(round, departmentIds),
      status: a.status,
      answers: round.questions.map((q) => text.get(q.id) ?? ""),
      slotStartsAt: slotOf.get(a.id) ?? null,
      conflicts: conflicts
        .data!.filter((c) => c.applicant_id === a.id)
        .map((c) => names.get(c.member_id) ?? "Unbekannt")
        .sort((x, y) => x.localeCompare(y, "de")),
    };
  });
  items.sort((x, y) => x.name.localeCompare(y.name, "de"));
  return { round, items };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export type TeamApplicant = {
  id: string;
  roundId: string;
  name: string;
  email: string;
  cohort: string;
  departments: string[];
  departmentAll: boolean;
  status: ApplicantStatus;
  source: Source;
  hasCv: boolean;
  createdAt: string;
  /** Every question of the round, in order; text "" if unanswered. */
  answers: { question: string; text: string }[];
  slot: {
    id: string;
    startsAt: string;
    interviewEndsAt: string;
    location: string;
    interviewers: { id: string; name: string }[];
  } | null;
  conflicts: { memberId: string; name: string }[];
};

/** One application, or null (unknown id, deleted, or no access). */
export async function loadTeamApplicant(session: SupabaseClient, id: string): Promise<TeamApplicant | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: a, error } = await session.from("applicants").select(APPLICANT_COLUMNS).eq("id", id).maybeSingle<ApplicantRow>();
  if (error) throw new Error(error.message);
  if (!a) return null;

  const [round, slot, conflicts, names] = await Promise.all([
    loadApplicationRound(session, a.round_id),
    session
      .from("slots")
      .select("id, applicant_id, starts_at, interview_ends_at, interviewer_a, interviewer_b, locations (name)")
      .eq("applicant_id", id)
      .maybeSingle<SlotRow>(),
    session.from("conflicts").select("member_id").eq("applicant_id", id).returns<{ member_id: string }[]>(),
    teamNames(session),
  ]);
  if (slot.error) throw new Error(slot.error.message);
  if (conflicts.error) throw new Error(conflicts.error.message);
  if (!round) return null;

  const nameOf = (memberId: string) => names.get(memberId) ?? "Unbekannt";
  const text = new Map(a.answers.map((x) => [x.question_id, x.text]));
  const departmentIds = a.applicant_departments.map((d) => d.department_id);
  const s = slot.data;
  return {
    id: a.id,
    roundId: a.round_id,
    name: a.name,
    email: a.email,
    cohort: a.cohort,
    departments: departmentNames(round, departmentIds),
    departmentAll: a.department_all,
    status: a.status,
    source: a.source,
    hasCv: !!a.cv_path,
    createdAt: a.created_at,
    answers: round.questions.map((q) => ({ question: q.text, text: text.get(q.id) ?? "" })),
    slot: s && {
      id: s.id,
      startsAt: s.starts_at,
      interviewEndsAt: s.interview_ends_at,
      location: roomLabel(s.locations?.name ?? ""),
      interviewers: [s.interviewer_a, s.interviewer_b]
        .filter((m): m is string => !!m)
        .map((m) => ({ id: m, name: nameOf(m) })),
    },
    conflicts: conflicts
      .data!.map((c) => ({ memberId: c.member_id, name: nameOf(c.member_id) }))
      .sort((x, y) => x.name.localeCompare(y.name, "de")),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Marks or removes the signed-in member's own conflict of interest. */
export async function setConflict(session: SupabaseClient, applicantId: string, conflicted: boolean): Promise<TeamResult> {
  const { member } = await getMember(session);
  if (!member) return NO_MEMBER;
  if (conflicted) {
    const { error } = await session.from("conflicts").insert({ applicant_id: applicantId, member_id: member.id });
    // Already marked (double click, second tab): fine.
    if (error && error.code !== "23505") {
      if (error.code === "23503") return GONE;
      throw new Error(error.message);
    }
  } else {
    const { error } = await session.from("conflicts").delete().eq("applicant_id", applicantId).eq("member_id", member.id);
    if (error) throw new Error(error.message);
  }
  return { ok: true };
}

/** "nicht erschienen" and back (PRD 4.8). Admins only; the data stays. */
export async function setStatus(session: SupabaseClient, applicantId: string, status: ApplicantStatus): Promise<TeamResult> {
  const { member } = await getMember(session);
  if (member?.role !== "admin") return NOT_ALLOWED;
  if (status !== "active" && status !== "no_show") return { error: "Unbekannter Status." };
  const { data, error } = await session.from("applicants").update({ status }).eq("id", applicantId).select("id");
  if (error) throw new Error(error.message);
  return data.length ? { ok: true } : GONE;
}

/**
 * "Bewerbung löschen" (Fynn, 29.09.2026: for example when someone withdraws by
 * mail and has no link). Same deletion as a withdrawal: the slot is freed and
 * the interviewers get a cancellation; the applicant gets no mail.
 */
export async function deleteApplicantAsAdmin(
  session: SupabaseClient,
  applicantId: string,
  send: Deliver = sendMail,
): Promise<TeamResult> {
  const { member } = await getMember(session);
  if (member?.role !== "admin") return NOT_ALLOWED;
  const { data, error } = await session
    .from("applicants")
    .select("id, round_id, cv_path")
    .eq("id", applicantId)
    .maybeSingle<{ id: string; round_id: string; cv_path: string | null }>();
  if (error) throw new Error(error.message);
  if (!data) return GONE;
  await deleteApplicant(session, { id: data.id, roundId: data.round_id, cvPath: data.cv_path }, send);
  return { ok: true };
}

/** Short-lived link to the CV, made on click. null = no CV (or no access). */
export async function cvUrl(session: SupabaseClient, applicantId: string, seconds = CV_LINK_SECONDS): Promise<string | null> {
  const { data, error } = await session
    .from("applicants")
    .select("cv_path")
    .eq("id", applicantId)
    .maybeSingle<{ cv_path: string | null }>();
  if (error) throw new Error(error.message);
  if (!data?.cv_path) return null;
  const signed = await session.storage.from(BUCKET).createSignedUrl(data.cv_path, seconds);
  if (signed.error) return null;
  return signed.data.signedUrl;
}
