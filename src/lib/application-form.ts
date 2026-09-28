// Form model and input validation for /bewerben, /b/[token] and
// /einstellungen/erfassen. Pure: no database, usable in the browser too.
import type { FieldErrors } from "@/lib/round-form";

export type { FieldErrors };

/** Bucket limit of "cv" (migration 20260928120100). */
export const MAX_CV_BYTES = 10 * 1024 * 1024;

const MAX_SHORT = 200;
const MAX_ANSWER = 10_000;

export interface ApplicationFields {
  name: string;
  email: string;
  cohort: string;
  /** question id → answer */
  answers: Record<string, string>;
  departmentIds: string[];
  /** "weiß ich noch nicht" */
  departmentUnsure: boolean;
  /** Checkbox under the privacy notice (public form only). */
  privacyConfirmed: boolean;
}

export type ApplicationWindow = "before" | "open" | "closed";

/** The form is open from opensAt (inclusive) until closesAt (exclusive). */
export function applicationWindow(opensAt: Date, closesAt: Date, now: Date): ApplicationWindow {
  if (now < opensAt) return "before";
  return now < closesAt ? "open" : "closed";
}

export function emptyFields(): ApplicationFields {
  return { name: "", email: "", cohort: "", answers: {}, departmentIds: [], departmentUnsure: false, privacyConfirmed: false };
}

/** Server actions receive whatever the client sends: bring it into shape first. */
export function coerceFields(raw: unknown): ApplicationFields {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const answers = r.answers && typeof r.answers === "object" ? (r.answers as Record<string, unknown>) : {};
  return {
    name: str(r.name),
    email: str(r.email),
    cohort: str(r.cohort),
    answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, str(v)])),
    departmentIds: Array.isArray(r.departmentIds) ? r.departmentIds.filter((d): d is string => typeof d === "string") : [],
    departmentUnsure: r.departmentUnsure === true,
    privacyConfirmed: r.privacyConfirmed === true,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Keys: "name", "email", "cohort", "answers.<questionId>", "departments", "privacy".
 * requireDepartment: the public form requires a department or "weiß ich noch
 * nicht"; an admin entering an application may leave it open.
 * withEmail: false when editing (the address is bound to the link).
 * requirePrivacy: the public form, when the round has a privacy notice.
 */
export function validateApplication(
  fields: ApplicationFields,
  round: { questionIds: string[]; departmentIds: string[] },
  options: { requireDepartment: boolean; withEmail: boolean; requirePrivacy?: boolean },
): FieldErrors {
  const errors: FieldErrors = {};

  const name = fields.name.trim();
  if (!name) errors.name = "Bitte gib deinen Namen an.";
  else if (name.length > MAX_SHORT) errors.name = `Höchstens ${MAX_SHORT} Zeichen.`;

  if (options.withEmail) {
    const email = fields.email.trim();
    if (!email) errors.email = "Bitte gib deine Mailadresse an.";
    else if (!EMAIL.test(email) || email.length > MAX_SHORT) errors.email = "Bitte gib eine gültige Mailadresse an.";
  }

  const cohort = fields.cohort.trim();
  if (!cohort) errors.cohort = "Bitte gib deinen Jahrgang an.";
  else if (cohort.length > MAX_SHORT) errors.cohort = `Höchstens ${MAX_SHORT} Zeichen.`;

  for (const id of round.questionIds) {
    const answer = (fields.answers[id] ?? "").trim();
    if (!answer) errors[`answers.${id}`] = "Bitte beantworte diese Frage.";
    else if (answer.length > MAX_ANSWER) errors[`answers.${id}`] = `Höchstens ${MAX_ANSWER} Zeichen.`;
  }

  if (fields.departmentIds.some((id) => !round.departmentIds.includes(id))) {
    errors.departments = "Unbekanntes Ressort. Bitte lade die Seite neu.";
  } else if (options.requireDepartment && !fields.departmentUnsure && fields.departmentIds.length === 0) {
    errors.departments = "Bitte wähle mindestens ein Ressort oder „weiß ich noch nicht“.";
  }

  if (options.requirePrivacy && !fields.privacyConfirmed) {
    errors.privacy = "Bitte bestätige, dass du den Datenschutzhinweis zur Kenntnis genommen hast.";
  }

  return errors;
}

/** Trimmed values as saved; "weiß ich noch nicht" clears the department choice. */
export function normalizeFields(fields: ApplicationFields, questionIds: string[]): ApplicationFields {
  return {
    name: fields.name.trim(),
    email: fields.email.trim().toLowerCase(),
    cohort: fields.cohort.trim(),
    answers: Object.fromEntries(questionIds.map((id) => [id, (fields.answers[id] ?? "").trim()])),
    departmentIds: fields.departmentUnsure ? [] : [...new Set(fields.departmentIds)],
    departmentUnsure: fields.departmentUnsure,
    privacyConfirmed: fields.privacyConfirmed,
  };
}

/** Check of the chosen file in the browser, before uploading. null = fine. */
export function cvFileError(file: { name: string; type: string; size: number } | null): string | null {
  if (!file || file.size === 0) return "Bitte lade deinen Lebenslauf als PDF hoch.";
  const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!pdf) return "Der Lebenslauf muss eine PDF-Datei sein.";
  if (file.size > MAX_CV_BYTES) return "Die PDF ist größer als 10 MB. Bitte verkleinere sie.";
  return null;
}

/** Every PDF starts with "%PDF-". Checked on the server after the upload. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return magic.every((b, i) => bytes[i] === b);
}
