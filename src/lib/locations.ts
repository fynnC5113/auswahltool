// Locations and blocked times (/terminplanung). Writes go through the admin's
// session, so RLS enforces "admins only".
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/auth/member";
import { normalizeInstant } from "@/lib/availability-grid";
import { berlinToUtc } from "@/lib/berlin-time";

export const DEFAULT_LOCATION = "0.23";

export type BlockedTime = { id: string; startsAt: string; endsAt: string; note: string };
export type Location = { id: string; name: string; isDefault: boolean; blockedTimes: BlockedTime[] };
export type LocationResult = { ok: true } | { error: string };

const NOT_ALLOWED: LocationResult = { error: "Das dürfen nur Admins." };

async function isAdmin(session: SupabaseClient): Promise<boolean> {
  const { member } = await getMember(session);
  return member?.role === "admin";
}

type Row = {
  id: string;
  name: string;
  is_default: boolean;
  blocked_times: { id: string; starts_at: string; ends_at: string; note: string }[];
};

/** Default location first, then by name; blocked times by start. */
export async function loadLocations(session: SupabaseClient, roundId: string): Promise<Location[]> {
  const { data, error } = await session
    .from("locations")
    .select("id, name, is_default, blocked_times (id, starts_at, ends_at, note)")
    .eq("round_id", roundId)
    .returns<Row[]>();
  if (error) throw new Error(error.message);
  return data
    .map((row) => ({
      id: row.id,
      name: row.name,
      isDefault: row.is_default,
      blockedTimes: row.blocked_times
        .map((b) => ({ id: b.id, startsAt: normalizeInstant(b.starts_at)!, endsAt: normalizeInstant(b.ends_at)!, note: b.note }))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, "de"));
}

/** The first location of a round becomes its default. */
export async function addLocation(session: SupabaseClient, roundId: string, rawName: string): Promise<LocationResult> {
  const name = rawName.trim();
  if (!name) return { error: "Bitte einen Namen eingeben." };
  if (!(await isAdmin(session))) return NOT_ALLOWED;

  const existing = await session.from("locations").select("name").eq("round_id", roundId);
  if (existing.error) return { error: existing.error.message };
  if (existing.data.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
    return { error: "Diesen Ort gibt es schon." };
  }
  const { error } = await session
    .from("locations")
    .insert({ round_id: roundId, name, is_default: existing.data.length === 0 });
  if (error) return { error: `Anlegen fehlgeschlagen: ${error.message}` };
  return { ok: true };
}

export async function renameLocation(session: SupabaseClient, id: string, rawName: string): Promise<LocationResult> {
  const name = rawName.trim();
  if (!name) return { error: "Bitte einen Namen eingeben." };
  const { data, error } = await session.from("locations").update({ name }).eq("id", id).select("id");
  if (error) return { error: error.message };
  // RLS filters the row away instead of raising an error.
  return data.length ? { ok: true } : NOT_ALLOWED;
}

/** At most one default per round (unique index), so clear the old one first. */
export async function setDefaultLocation(session: SupabaseClient, id: string): Promise<LocationResult> {
  if (!(await isAdmin(session))) return NOT_ALLOWED;
  const target = await session.from("locations").select("round_id").eq("id", id).maybeSingle<{ round_id: string }>();
  if (target.error) return { error: target.error.message };
  if (!target.data) return { error: "Den Ort gibt es nicht mehr." };

  const cleared = await session
    .from("locations")
    .update({ is_default: false })
    .eq("round_id", target.data.round_id)
    .eq("is_default", true);
  if (cleared.error) return { error: cleared.error.message };
  const { data, error } = await session.from("locations").update({ is_default: true }).eq("id", id).select("id");
  if (error) return { error: error.message };
  return data.length ? { ok: true } : NOT_ALLOWED;
}

/** Deleting a location would cascade to its slots, so refuse while it has any. */
export async function deleteLocation(session: SupabaseClient, id: string): Promise<LocationResult> {
  if (!(await isAdmin(session))) return NOT_ALLOWED;
  const slots = await session.from("slots").select("id", { count: "exact", head: true }).eq("location_id", id);
  if (slots.error) return { error: slots.error.message };
  if (slots.count) return { error: "An diesem Ort gibt es schon Gesprächstermine. Er lässt sich nicht löschen." };

  const { data, error } = await session.from("locations").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  return data.length ? { ok: true } : NOT_ALLOWED;
}

/** startsAt and endsAt as datetime-local values (Berlin time). */
export async function addBlockedTime(
  session: SupabaseClient,
  input: { locationId: string; startsAt: string; endsAt: string; note: string },
): Promise<LocationResult> {
  const startsAt = berlinToUtc(input.startsAt);
  const endsAt = berlinToUtc(input.endsAt);
  if (!startsAt || !endsAt) return { error: "Bitte Beginn und Ende angeben." };
  if (endsAt <= startsAt) return { error: "Das Ende muss nach dem Beginn liegen." };

  const { error } = await session
    .from("blocked_times")
    .insert({ location_id: input.locationId, starts_at: startsAt, ends_at: endsAt, note: input.note.trim() });
  if (error?.code === "42501") return NOT_ALLOWED;
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };
  return { ok: true };
}

export async function deleteBlockedTime(session: SupabaseClient, id: string): Promise<LocationResult> {
  const { data, error } = await session.from("blocked_times").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  return data.length ? { ok: true } : NOT_ALLOWED;
}
