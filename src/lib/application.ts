// Applications (TECH_DESIGN 6.1). Server only.
//
// Two callers, two clients:
//   - public form and applicant page: the secret-key client (createAdminClient),
//     after checking deadline and token; every query is bound to one applicant.
//   - admin entry (/einstellungen/erfassen): the admin's session, RLS decides.
//
// The CV is uploaded by the browser straight to Storage with a signed upload
// URL (Vercel functions accept at most 4.5 MB per request). So submitting is
// two steps: prepare (checks, upload URL), then submit (verify the file, save).
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/auth/login";
import { createToken, hashToken } from "@/lib/applicant-token";
import {
  MAX_CV_BYTES,
  applicationWindow,
  looksLikePdf,
  normalizeFields,
  validateApplication,
  type ApplicationFields,
  type FieldErrors,
} from "@/lib/application-form";
import { sendMail, type MailTransport, type SendOptions } from "@/lib/mail/send";
import { applicationLinkMail, applicationReceivedMail } from "@/lib/mail/templates";

export type Source = "form" | "admin";

export interface ApplicationRound {
  id: string;
  title: string;
  opensAt: Date;
  closesAt: Date;
  replyTo: string;
  mailTransport: MailTransport;
  privacyNotice: string;
  questions: { id: string; text: string }[];
  departments: { id: string; name: string; description: string }[];
}

export interface Applicant {
  id: string;
  name: string;
  email: string;
  cohort: string;
  departmentUnsure: boolean;
  departmentIds: string[];
  answers: Record<string, string>;
  cvPath: string | null;
  source: Source;
  createdAt: string;
  updatedAt: string;
  round: ApplicationRound;
}

export interface Deps {
  send?: typeof sendMail;
  now?: Date;
  /** Default: the newest round. Tests pass their own, other test files create rounds in parallel. */
  roundId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const BUCKET = "cv";

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

// ---------------------------------------------------------------------------
// Round
// ---------------------------------------------------------------------------

type RoundRow = {
  id: string;
  title: string;
  application_opens_at: string;
  application_closes_at: string;
  reply_to: string;
  mail_transport: MailTransport;
  privacy_notice: string;
  questions: { id: string; position: number; text: string }[];
  departments: { id: string; position: number; name: string; description: string }[];
};

/** The newest round (or the one with roundId), as the application form needs it. */
export async function loadApplicationRound(db: SupabaseClient, roundId?: string): Promise<ApplicationRound | null> {
  let query = db
    .from("rounds")
    .select(
      `id, title, application_opens_at, application_closes_at, reply_to, mail_transport, privacy_notice,
       questions (id, position, text), departments (id, position, name, description)`,
    );
  if (roundId) query = query.eq("id", roundId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle<RoundRow>();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    opensAt: new Date(data.application_opens_at),
    closesAt: new Date(data.application_closes_at),
    replyTo: data.reply_to,
    mailTransport: data.mail_transport,
    privacyNotice: data.privacy_notice,
    questions: [...data.questions].sort(byPosition).map(({ id, text }) => ({ id, text })),
    departments: [...data.departments]
      .sort(byPosition)
      .map(({ id, name, description }) => ({ id, name, description })),
  };
}

function roundIds(round: ApplicationRound) {
  return { questionIds: round.questions.map((q) => q.id), departmentIds: round.departments.map((d) => d.id) };
}

function mailOptions(round: ApplicationRound): SendOptions {
  return { transport: round.mailTransport, replyTo: round.replyTo };
}

function personalUrl(token: string): string {
  return new URL(`/b/${token}`, appUrl()).toString();
}

// ---------------------------------------------------------------------------
// CV files
// ---------------------------------------------------------------------------

/** Path convention (migration 20260928120100): <round_id>/<applicant_id>.pdf */
function cvPath(roundId: string, applicantId: string): string {
  return `${roundId}/${applicantId}.pdf`;
}

/** Downloads the uploaded file and checks it. null = fine. */
async function cvError(db: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) return "Der Lebenslauf ist nicht angekommen. Bitte versuche es noch einmal.";
  if (data.size > MAX_CV_BYTES) return "Die PDF ist größer als 10 MB. Bitte verkleinere sie.";
  const head = new Uint8Array(await data.slice(0, 5).arrayBuffer());
  if (!looksLikePdf(head)) return "Der Lebenslauf muss eine PDF-Datei sein.";
  return null;
}

async function removeFiles(db: SupabaseClient, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await db.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`removing CV failed: ${error.message}`);
}

/** Removes an upload that did not become an application. Never touches an existing applicant's file. */
async function discardUpload(db: SupabaseClient, roundId: string, applicantId: string): Promise<void> {
  if (!UUID.test(applicantId)) return;
  const { data } = await db.from("applicants").select("id").eq("id", applicantId).maybeSingle();
  if (data) return;
  await removeFiles(db, [cvPath(roundId, applicantId)]).catch((e) => console.error(e));
}

// ---------------------------------------------------------------------------
// New application: prepare, then submit
// ---------------------------------------------------------------------------

export type PrepareResult =
  | { status: "closed" }
  | { status: "invalid"; errors: FieldErrors }
  /** Same address already applied: a new link was sent (public form only). */
  | { status: "exists" }
  | { status: "upload"; applicantId: string; path: string; token: string };

export type SubmitResult =
  | { status: "closed" }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "exists" }
  | { status: "done"; mailSent: boolean };

const ADMIN_DUPLICATE = "Für diese Adresse gibt es in dieser Runde schon eine Bewerbung.";
const RELOAD = "Die Runde hat sich geändert. Bitte lade die Seite neu und versuche es noch einmal.";

function checkFields(round: ApplicationRound, fields: ApplicationFields, source: Source): FieldErrors {
  return validateApplication(fields, roundIds(round), {
    requireDepartment: source === "form",
    withEmail: true,
    requirePrivacy: source === "form" && round.privacyNotice.trim() !== "",
  });
}

async function existingByEmail(db: SupabaseClient, roundId: string, email: string) {
  const { data, error } = await db
    .from("applicants")
    .select("id, name, email")
    .eq("round_id", roundId)
    // Stored in lower case (normalizeFields), like the unique index on lower(email).
    .eq("email", email.toLowerCase())
    .maybeSingle<{ id: string; name: string; email: string }>();
  if (error) throw new Error(error.message);
  return data;
}

/** New token for an existing applicant; the old link stops working at once. */
async function resendLink(
  db: SupabaseClient,
  round: ApplicationRound,
  applicant: { id: string; name: string; email: string },
  send: typeof sendMail,
): Promise<void> {
  const token = createToken();
  const { error } = await db.from("applicants").update({ token_hash: hashToken(token) }).eq("id", applicant.id);
  if (error) throw new Error(error.message);
  await send({ to: applicant.email, ...applicationLinkMail({ name: applicant.name, url: personalUrl(token) }) }, mailOptions(round));
}

/** Step 1: deadline, required fields, duplicate; then a signed upload URL for the CV. */
export async function prepareApplication(
  db: SupabaseClient,
  input: ApplicationFields,
  source: Source,
  { send = sendMail, now = new Date(), roundId }: Deps = {},
): Promise<PrepareResult> {
  const round = await loadApplicationRound(db, roundId);
  if (!round) return { status: "closed" };
  if (source === "form" && applicationWindow(round.opensAt, round.closesAt, now) !== "open") return { status: "closed" };

  const errors = checkFields(round, input, source);
  if (Object.keys(errors).length) return { status: "invalid", errors };
  const fields = normalizeFields(input, roundIds(round).questionIds);

  const existing = await existingByEmail(db, round.id, fields.email);
  if (existing) {
    if (source === "admin") return { status: "invalid", errors: { email: ADMIN_DUPLICATE } };
    await resendLink(db, round, existing, send);
    return { status: "exists" };
  }

  const applicantId = randomUUID();
  const path = cvPath(round.id, applicantId);
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`signed upload URL failed: ${error?.message}`);
  return { status: "upload", applicantId, path, token: data.token };
}

/** Step 2: the CV is uploaded; check it, save everything, send the personal link. */
export async function submitApplication(
  db: SupabaseClient,
  input: ApplicationFields,
  applicantId: string,
  source: Source,
  { send = sendMail, now = new Date(), roundId }: Deps = {},
): Promise<SubmitResult> {
  const round = await loadApplicationRound(db, roundId);
  if (!round) return { status: "closed" };
  if (!UUID.test(applicantId)) return { status: "invalid", errors: { form: RELOAD } };

  const { data: taken } = await db.from("applicants").select("id").eq("id", applicantId).maybeSingle();
  if (taken) return { status: "invalid", errors: { form: RELOAD } };

  if (source === "form" && applicationWindow(round.opensAt, round.closesAt, now) !== "open") {
    await discardUpload(db, round.id, applicantId);
    return { status: "closed" };
  }

  const errors = checkFields(round, input, source);
  const cv = await cvError(db, cvPath(round.id, applicantId));
  if (cv) errors.cv = cv;
  if (Object.keys(errors).length) {
    await discardUpload(db, round.id, applicantId);
    return { status: "invalid", errors };
  }
  const fields = normalizeFields(input, roundIds(round).questionIds);

  const token = createToken();
  const { error } = await db.rpc("save_application", {
    p_create: true,
    p_applicant: {
      id: applicantId,
      round_id: round.id,
      name: fields.name,
      email: fields.email,
      cohort: fields.cohort,
      department_unsure: fields.departmentUnsure,
      cv_path: cvPath(round.id, applicantId),
      token_hash: hashToken(token),
      source,
      // The database sets privacy_confirmed_at = now(); checked in checkFields.
      privacy_confirmed: source === "form" && fields.privacyConfirmed,
    },
    p_answers: Object.entries(fields.answers).map(([question_id, text]) => ({ question_id, text })),
    p_department_ids: fields.departmentIds,
  });

  if (error) {
    await discardUpload(db, round.id, applicantId);
    // Unique (round, lower(email)): applied twice at the same time.
    if (error.code === "23505" && error.message.includes("applicants_round_email_key")) {
      if (source === "admin") return { status: "invalid", errors: { email: ADMIN_DUPLICATE } };
      const existing = await existingByEmail(db, round.id, fields.email);
      if (existing) await resendLink(db, round, existing, send);
      return { status: "exists" };
    }
    if (error.hint === "answer_missing" || error.code === "P0002") return { status: "invalid", errors: { form: RELOAD } };
    throw new Error(`save_application failed: ${error.message}`);
  }

  // After the deadline (admin entry) the mail offers no editing.
  const closesAt = now < round.closesAt ? round.closesAt : null;
  try {
    await send(
      { to: fields.email, ...applicationReceivedMail({ name: fields.name, url: personalUrl(token), closesAt }) },
      mailOptions(round),
    );
    return { status: "done", mailSent: true };
  } catch (e) {
    // The application is saved; applying again with the same address sends a new link.
    console.error("application mail failed", e);
    return { status: "done", mailSent: false };
  }
}

// ---------------------------------------------------------------------------
// Applicant page /b/[token] (secret-key client only)
// ---------------------------------------------------------------------------

type ApplicantRow = {
  id: string;
  round_id: string;
  name: string;
  email: string;
  cohort: string;
  department_unsure: boolean;
  cv_path: string | null;
  source: Source;
  created_at: string;
  updated_at: string;
  answers: { question_id: string; text: string }[];
  applicant_departments: { department_id: string }[];
};

/** The applicant behind a token, or null (invalid token or deleted). */
export async function findApplicant(db: SupabaseClient, token: string): Promise<Applicant | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await db
    .from("applicants")
    .select(
      `id, round_id, name, email, cohort, department_unsure, cv_path, source, created_at, updated_at,
       answers (question_id, text), applicant_departments (department_id)`,
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle<ApplicantRow>();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const round = await loadApplicationRound(db, data.round_id);
  if (!round) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    cohort: data.cohort,
    departmentUnsure: data.department_unsure,
    departmentIds: data.applicant_departments.map((d) => d.department_id),
    answers: Object.fromEntries(data.answers.map((a) => [a.question_id, a.text])),
    cvPath: data.cv_path,
    source: data.source,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    round,
  };
}

/** Editing is possible until the end of the application phase. */
export function canEdit(applicant: Applicant, now = new Date()): boolean {
  return now < applicant.round.closesAt;
}

/** Short-lived link to the applicant's own CV. */
export async function cvLink(db: SupabaseClient, token: string): Promise<string | null> {
  const applicant = await findApplicant(db, token);
  if (!applicant?.cvPath) return null;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(applicant.cvPath, 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export type EditResult =
  | { status: "notfound" }
  | { status: "closed" }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "upload"; path: string; token: string }
  | { status: "done" };

/** Upload URL for a new CV under a new name; the old one stays until the edit is saved. */
export async function prepareCvReplacement(db: SupabaseClient, token: string, now = new Date()): Promise<EditResult> {
  const applicant = await findApplicant(db, token);
  if (!applicant) return { status: "notfound" };
  if (!canEdit(applicant, now)) return { status: "closed" };
  const path = `${applicant.round.id}/${applicant.id}-${randomUUID()}.pdf`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`signed upload URL failed: ${error?.message}`);
  return { status: "upload", path, token: data.token };
}

/** Saves the edit; newCvPath is the path from prepareCvReplacement, or null to keep the CV. */
export async function updateApplication(
  db: SupabaseClient,
  token: string,
  input: ApplicationFields,
  newCvPath: string | null,
  now = new Date(),
): Promise<EditResult> {
  const applicant = await findApplicant(db, token);
  if (!applicant) return { status: "notfound" };
  const { round } = applicant;
  const discard = () => (newCvPath ? removeFiles(db, [newCvPath]).catch((e) => console.error(e)) : undefined);

  if (newCvPath !== null) {
    const own = new RegExp(`^${round.id}/${applicant.id}-[0-9a-f-]{36}\\.pdf$`);
    if (!own.test(newCvPath)) return { status: "invalid", errors: { form: RELOAD } };
  }
  if (!canEdit(applicant, now)) {
    await discard();
    return { status: "closed" };
  }

  const errors = validateApplication(input, roundIds(round), { requireDepartment: true, withEmail: false });
  if (newCvPath) {
    const cv = await cvError(db, newCvPath);
    if (cv) errors.cv = cv;
  }
  if (Object.keys(errors).length) {
    await discard();
    return { status: "invalid", errors };
  }
  const fields = normalizeFields(input, roundIds(round).questionIds);

  const { error } = await db.rpc("save_application", {
    p_create: false,
    p_applicant: {
      id: applicant.id,
      name: fields.name,
      cohort: fields.cohort,
      department_unsure: fields.departmentUnsure,
      ...(newCvPath ? { cv_path: newCvPath } : {}),
    },
    p_answers: Object.entries(fields.answers).map(([question_id, text]) => ({ question_id, text })),
    p_department_ids: fields.departmentIds,
  });
  if (error) {
    await discard();
    if (error.hint === "answer_missing" || error.code === "P0002") return { status: "invalid", errors: { form: RELOAD } };
    throw new Error(`save_application failed: ${error.message}`);
  }

  if (newCvPath && applicant.cvPath && applicant.cvPath !== newCvPath) {
    await removeFiles(db, [applicant.cvPath]).catch((e) => console.error(e));
  }
  return { status: "done" };
}

/**
 * Withdrawal = immediate, final deletion (PRD 4.8): first every file of the
 * applicant, then the row (cascade: answers, departments, feedback, conflicts,
 * board). A booked slot becomes free (slots.applicant_id on delete set null);
 * the calendar cancellation follows in Phase 12.
 */
export async function withdrawApplication(db: SupabaseClient, token: string): Promise<boolean> {
  const applicant = await findApplicant(db, token);
  if (!applicant) return false;
  const folder = applicant.round.id;

  const { data: files, error } = await db.storage.from(BUCKET).list(folder, { search: applicant.id, limit: 1000 });
  if (error) throw new Error(error.message);
  const paths = new Set((files ?? []).filter((f) => f.name.startsWith(applicant.id)).map((f) => `${folder}/${f.name}`));
  if (applicant.cvPath) paths.add(applicant.cvPath);
  await removeFiles(db, [...paths]);

  const del = await db.from("applicants").delete().eq("id", applicant.id);
  if (del.error) throw new Error(del.error.message);
  return true;
}

// ---------------------------------------------------------------------------
// Admin list (/bewerbungen), with the member's session
// ---------------------------------------------------------------------------

export interface ApplicationListItem {
  id: string;
  name: string;
  email: string;
  cohort: string;
  source: Source;
  hasCv: boolean;
  departments: string[];
  departmentUnsure: boolean;
  createdAt: string;
}

export async function listApplications(session: SupabaseClient, roundId: string): Promise<ApplicationListItem[]> {
  const { data, error } = await session
    .from("applicants")
    .select("id, name, email, cohort, source, cv_path, department_unsure, created_at, applicant_departments (departments (name, position))")
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    name: string;
    email: string;
    cohort: string;
    source: Source;
    cv_path: string | null;
    department_unsure: boolean;
    created_at: string;
    applicant_departments: { departments: { name: string; position: number } | null }[];
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    cohort: r.cohort,
    source: r.source,
    hasCv: !!r.cv_path,
    departments: r.applicant_departments
      .map((d) => d.departments)
      .filter((d): d is { name: string; position: number } => !!d)
      .sort(byPosition)
      .map((d) => d.name),
    departmentUnsure: r.department_unsure,
    createdAt: r.created_at,
  }));
}
