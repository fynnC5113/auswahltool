// Form model and input validation for /einstellungen/runde. Pure: no
// database. All values are strings as they come from the inputs; validation
// turns them into the arguments of the database function save_round.
import { berlinToUtc } from "@/lib/berlin-time";

export const DEFAULT_REPLY_TO = "termin.lawclinic@law-school.de";

/** key: stable React key (the id for saved items, random for new ones). */
export type QuestionItem = { key: string; id: string | null; text: string };
export type DepartmentItem = { key: string; id: string | null; name: string; description: string };
export type CriterionItem = {
  key: string;
  id: string | null;
  name: string;
  description: string;
  weight: string;
  scaleMin: string;
  scaleMax: string;
};

export interface RoundForm {
  id: string | null;
  title: string;
  year: string;
  seats: string;
  interviewMinutes: string;
  bufferMinutes: string;
  rebookHoursBefore: string;
  /** datetime-local, Berlin time */
  applicationOpensAt: string;
  applicationClosesAt: string;
  /** YYYY-MM-DD */
  interviewsFrom: string;
  interviewsUntil: string;
  deletionDate: string;
  mailTransport: string;
  replyTo: string;
  privacyNotice: string;
  /** How many questions an application must answer; "" = all. */
  requiredAnswers: string;
  questions: QuestionItem[];
  departments: DepartmentItem[];
  criteria: CriterionItem[];
}

/** Field → message. Keys: "title", "questions.0.text", "criteria.2.weight", "form" ... */
export type FieldErrors = Record<string, string>;

export interface SaveRoundArgs {
  p_round: Record<string, string | number | null>;
  p_questions: { id: string | null; text: string }[];
  p_departments: { id: string | null; name: string; description: string }[];
  p_criteria: {
    id: string | null;
    name: string;
    description: string;
    weight: number;
    scale_min: number;
    scale_max: number;
  }[];
}

export function emptyForm(year: number): RoundForm {
  return {
    id: null,
    title: "",
    year: String(year),
    seats: "",
    interviewMinutes: "",
    bufferMinutes: "0",
    rebookHoursBefore: "24",
    applicationOpensAt: "",
    applicationClosesAt: "",
    interviewsFrom: "",
    interviewsUntil: "",
    deletionDate: "",
    mailTransport: "gmail",
    replyTo: DEFAULT_REPLY_TO,
    privacyNotice: "",
    requiredAnswers: "",
    questions: [],
    departments: [],
    criteria: [],
  };
}

export function newCriterion(key: string): CriterionItem {
  return { key, id: null, name: "", description: "", weight: "1", scaleMin: "1", scaleMax: "5" };
}

// ---------------------------------------------------------------------------
// Untrusted input (the server receives whatever the browser sends)
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : [];
}

function idOf(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Brings any object into the shape of RoundForm; missing fields become "". */
export function toRoundForm(raw: unknown): RoundForm {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: idOf(r.id),
    title: str(r.title),
    year: str(r.year),
    seats: str(r.seats),
    interviewMinutes: str(r.interviewMinutes),
    bufferMinutes: str(r.bufferMinutes),
    rebookHoursBefore: str(r.rebookHoursBefore),
    applicationOpensAt: str(r.applicationOpensAt),
    applicationClosesAt: str(r.applicationClosesAt),
    interviewsFrom: str(r.interviewsFrom),
    interviewsUntil: str(r.interviewsUntil),
    deletionDate: str(r.deletionDate),
    mailTransport: str(r.mailTransport),
    replyTo: str(r.replyTo),
    privacyNotice: str(r.privacyNotice),
    requiredAnswers: str(r.requiredAnswers),
    questions: list(r.questions).map((q) => ({ key: str(q.key), id: idOf(q.id), text: str(q.text) })),
    departments: list(r.departments).map((d) => ({
      key: str(d.key),
      id: idOf(d.id),
      name: str(d.name),
      description: str(d.description),
    })),
    criteria: list(r.criteria).map((c) => ({
      key: str(c.key),
      id: idOf(c.id),
      name: str(c.name),
      description: str(c.description),
      weight: str(c.weight),
      scaleMin: str(c.scaleMin),
      scaleMax: str(c.scaleMax),
    })),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function wholeNumber(value: string): number | null {
  const v = value.trim();
  return /^-?\d+$/.test(v) ? Number(v) : null;
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function validateRound(form: RoundForm): { errors: FieldErrors } | { value: SaveRoundArgs } {
  const errors: FieldErrors = {};

  const title = form.title.trim();
  if (!title) errors.title = "Bitte einen Titel eingeben.";

  const year = wholeNumber(form.year);
  if (year === null || year < 2000 || year > 2100) errors.year = "Bitte ein Jahr wie 2026 eingeben.";

  const seats = wholeNumber(form.seats);
  if (seats === null || seats < 1) errors.seats = "Mindestens 1 Platz.";

  const interviewMinutes = wholeNumber(form.interviewMinutes);
  if (interviewMinutes === null || interviewMinutes < 1) errors.interviewMinutes = "Bitte eine Dauer in Minuten eingeben (mindestens 1).";

  const bufferMinutes = wholeNumber(form.bufferMinutes);
  if (bufferMinutes === null || bufferMinutes < 0) errors.bufferMinutes = "Bitte 0 oder mehr Minuten eingeben.";

  const rebookHoursBefore = wholeNumber(form.rebookHoursBefore);
  if (rebookHoursBefore === null || rebookHoursBefore < 0) errors.rebookHoursBefore = "Bitte 0 oder mehr Stunden eingeben.";

  const opensAt = berlinToUtc(form.applicationOpensAt);
  if (!opensAt) errors.applicationOpensAt = "Bitte Datum und Uhrzeit eingeben.";
  const closesAt = berlinToUtc(form.applicationClosesAt);
  if (!closesAt) errors.applicationClosesAt = "Bitte Datum und Uhrzeit eingeben.";
  else if (opensAt && closesAt <= opensAt) errors.applicationClosesAt = "Das Ende muss nach dem Beginn liegen.";

  if (!isDate(form.interviewsFrom)) errors.interviewsFrom = "Bitte ein Datum eingeben.";
  if (!isDate(form.interviewsUntil)) errors.interviewsUntil = "Bitte ein Datum eingeben.";
  else if (isDate(form.interviewsFrom) && form.interviewsUntil < form.interviewsFrom) {
    errors.interviewsUntil = "Das Ende darf nicht vor dem Beginn liegen.";
  }

  if (!isDate(form.deletionDate)) errors.deletionDate = "Bitte ein Datum eingeben.";
  else if (isDate(form.interviewsUntil) && form.deletionDate <= form.interviewsUntil) {
    errors.deletionDate = "Das Löschdatum muss nach dem Ende der Gespräche liegen.";
  }

  if (form.mailTransport !== "gmail" && form.mailTransport !== "graph") errors.mailTransport = "Bitte einen Versandweg wählen.";

  const replyTo = form.replyTo.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) errors.replyTo = "Bitte eine gültige Mailadresse eingeben.";

  const questions = form.questions.map((q, i) => {
    const text = q.text.trim();
    if (!text) errors[`questions.${i}.text`] = "Bitte einen Fragetext eingeben.";
    return { id: q.id, text };
  });

  let requiredAnswers: number | null = null;
  if (form.requiredAnswers.trim() !== "") {
    requiredAnswers = wholeNumber(form.requiredAnswers);
    if (requiredAnswers === null || requiredAnswers < 0 || requiredAnswers > questions.length) {
      errors.requiredAnswers = `Bitte eine Zahl von 0 bis ${questions.length} eingeben oder leer lassen.`;
    }
  }

  const departments = form.departments.map((d, i) => {
    const name = d.name.trim();
    if (!name) errors[`departments.${i}.name`] = "Bitte einen Namen eingeben.";
    return { id: d.id, name, description: d.description.trim() };
  });

  const criteria = form.criteria.map((c, i) => {
    const name = c.name.trim();
    if (!name) errors[`criteria.${i}.name`] = "Bitte einen Namen eingeben.";

    const weightText = c.weight.trim().replace(",", ".");
    const weight = /^\d+(\.\d+)?$/.test(weightText) ? Number(weightText) : NaN;
    if (!(weight > 0)) errors[`criteria.${i}.weight`] = "Das Gewicht muss größer als 0 sein.";

    const scaleMin = wholeNumber(c.scaleMin);
    const scaleMax = wholeNumber(c.scaleMax);
    if (scaleMin === null) errors[`criteria.${i}.scaleMin`] = "Bitte eine ganze Zahl eingeben.";
    if (scaleMax === null) errors[`criteria.${i}.scaleMax`] = "Bitte eine ganze Zahl eingeben.";
    else if (scaleMin !== null && scaleMax <= scaleMin) errors[`criteria.${i}.scaleMax`] = "Das Maximum muss größer als das Minimum sein.";

    return { id: c.id, name, description: c.description.trim(), weight, scale_min: scaleMin ?? 0, scale_max: scaleMax ?? 0 };
  });

  if (Object.keys(errors).length) return { errors };

  return {
    value: {
      p_round: {
        id: form.id,
        title,
        year: year!,
        seats: seats!,
        interview_minutes: interviewMinutes!,
        buffer_minutes: bufferMinutes!,
        rebook_hours_before: rebookHoursBefore!,
        application_opens_at: opensAt!,
        application_closes_at: closesAt!,
        interviews_from: form.interviewsFrom,
        interviews_until: form.interviewsUntil,
        deletion_date: form.deletionDate,
        mail_transport: form.mailTransport,
        reply_to: replyTo,
        privacy_notice: form.privacyNotice.trim(),
        required_answers: requiredAnswers,
      },
      p_questions: questions,
      p_departments: departments,
      p_criteria: criteria,
    },
  };
}
