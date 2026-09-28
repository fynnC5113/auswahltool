// Round configuration (/einstellungen/runde). Reads and writes with the
// member's session: RLS and the database function save_round decide who may
// save (admins only) and which items may be removed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { utcToBerlin } from "@/lib/berlin-time";
import { toRoundForm, validateRound, type FieldErrors, type RoundForm } from "@/lib/round-form";

/** inUse: ids of removed items that already have data; nothing was saved. */
export type SaveResult = { ok: true; id: string } | { errors: FieldErrors; inUse?: string[] };

type Row = {
  id: string;
  title: string;
  year: number;
  seats: number;
  interview_minutes: number;
  buffer_minutes: number;
  rebook_hours_before: number;
  application_opens_at: string;
  application_closes_at: string;
  interviews_from: string;
  interviews_until: string;
  deletion_date: string;
  mail_transport: string;
  reply_to: string;
  privacy_notice: string;
  questions: { id: string; position: number; text: string }[];
  departments: { id: string; position: number; name: string; description: string }[];
  criteria: {
    id: string;
    position: number;
    name: string;
    description: string;
    weight: number;
    scale_min: number;
    scale_max: number;
  }[];
};

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/** The newest round (or the one with roundId) as form values, or null. */
export async function loadRound(session: SupabaseClient, roundId?: string): Promise<RoundForm | null> {
  let query = session
    .from("rounds")
    .select(
      `id, title, year, seats, interview_minutes, buffer_minutes, rebook_hours_before,
       application_opens_at, application_closes_at, interviews_from, interviews_until,
       deletion_date, mail_transport, reply_to, privacy_notice,
       questions (id, position, text),
       departments (id, position, name, description),
       criteria (id, position, name, description, weight, scale_min, scale_max)`,
    );
  if (roundId) query = query.eq("id", roundId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle<Row>();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    title: data.title,
    year: String(data.year),
    seats: String(data.seats),
    interviewMinutes: String(data.interview_minutes),
    bufferMinutes: String(data.buffer_minutes),
    rebookHoursBefore: String(data.rebook_hours_before),
    applicationOpensAt: utcToBerlin(data.application_opens_at),
    applicationClosesAt: utcToBerlin(data.application_closes_at),
    interviewsFrom: data.interviews_from,
    interviewsUntil: data.interviews_until,
    deletionDate: data.deletion_date,
    mailTransport: data.mail_transport,
    replyTo: data.reply_to,
    privacyNotice: data.privacy_notice,
    questions: [...data.questions].sort(byPosition).map((q) => ({ key: q.id, id: q.id, text: q.text })),
    departments: [...data.departments]
      .sort(byPosition)
      .map((d) => ({ key: d.id, id: d.id, name: d.name, description: d.description })),
    criteria: [...data.criteria].sort(byPosition).map((c) => ({
      key: c.id,
      id: c.id,
      name: c.name,
      description: c.description,
      weight: String(c.weight).replace(".", ","),
      scaleMin: String(c.scale_min),
      scaleMax: String(c.scale_max),
    })),
  };
}

/** Validates and saves in one transaction (save_round). */
export async function saveRound(session: SupabaseClient, raw: unknown): Promise<SaveResult> {
  const form = toRoundForm(raw);
  const validated = validateRound(form);
  if ("errors" in validated) return validated;

  const { data, error } = await session.rpc("save_round", validated.value);
  if (!error) return { ok: true, id: data as string };

  if (error.code === "42501") return { errors: { form: "Das dürfen nur Admins." } };
  if (error.hint === "in_use") {
    return {
      errors: { form: "Nichts gespeichert: Einträge mit vorhandenen Daten lassen sich nicht entfernen." },
      inUse: (error.details ?? "").split(",").filter(Boolean),
    };
  }
  if (error.hint === "scale_in_use") {
    const index = form.criteria.findIndex((c) => c.id === error.details);
    const message = "Die Skala lässt sich nicht mehr ändern, weil es schon Bewertungen gibt.";
    return { errors: index >= 0 ? { [`criteria.${index}.scaleMax`]: message } : { form: message } };
  }
  return { errors: { form: `Speichern fehlgeschlagen: ${error.message}` } };
}
