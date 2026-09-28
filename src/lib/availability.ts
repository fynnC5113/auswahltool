// Own availability and interview limit (/verfuegbarkeit). Reads and writes
// with the member's session: RLS lets every member write only their own rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/auth/member";
import {
  cellEnd,
  gridDays,
  normalizeInstant,
  parseMaxInterviews,
  validateSelection,
  type Blocked,
} from "@/lib/availability-grid";

export type PlanningRound = { id: string; title: string; interviewsFrom: string; interviewsUntil: string };
export type MyAvailability = { starts: string[]; maxInterviews: number | null };
export type AvailabilityResult = { ok: true } | { error: string };

/** The newest round (or the one with roundId), or null. */
export async function loadPlanningRound(session: SupabaseClient, roundId?: string): Promise<PlanningRound | null> {
  let query = session.from("rounds").select("id, title, interviews_from, interviews_until");
  if (roundId) query = query.eq("id", roundId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; title: string; interviews_from: string; interviews_until: string }>();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id, title: data.title, interviewsFrom: data.interviews_from, interviewsUntil: data.interviews_until };
}

export async function loadMyAvailability(session: SupabaseClient, roundId: string, memberId: string): Promise<MyAvailability> {
  const [cells, settings] = await Promise.all([
    session.from("availabilities").select("starts_at").eq("round_id", roundId).eq("member_id", memberId),
    session
      .from("member_round_settings")
      .select("max_interviews")
      .eq("round_id", roundId)
      .eq("member_id", memberId)
      .maybeSingle<{ max_interviews: number | null }>(),
  ]);
  if (cells.error) throw new Error(cells.error.message);
  if (settings.error) throw new Error(settings.error.message);
  return {
    starts: cells.data.map((row) => normalizeInstant(row.starts_at)!).sort(),
    maxInterviews: settings.data?.max_interviews ?? null,
  };
}

/** Blocked times of all locations of the round, for marking the grid. */
export async function loadBlockedTimes(session: SupabaseClient, roundId: string): Promise<Blocked[]> {
  const { data, error } = await session
    .from("blocked_times")
    .select("starts_at, ends_at, note, locations!inner (name, round_id)")
    .eq("locations.round_id", roundId)
    .order("starts_at")
    .returns<{ starts_at: string; ends_at: string; note: string; locations: { name: string } }[]>();
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    startsAt: normalizeInstant(row.starts_at)!,
    endsAt: normalizeInstant(row.ends_at)!,
    location: row.locations.name,
    note: row.note,
  }));
}

/**
 * Makes the member's cells equal to `starts` (adds new ones, removes the
 * others) and saves the limit.
 */
export async function saveAvailability(
  session: SupabaseClient,
  input: { roundId: string; starts: unknown; maxInterviews: string },
): Promise<AvailabilityResult> {
  const max = parseMaxInterviews(input.maxInterviews);
  if ("error" in max) return max;

  const { member } = await getMember(session);
  if (!member) return { error: "Dein Zugang ist nicht (mehr) freigeschaltet." };
  const round = await loadPlanningRound(session, input.roundId);
  if (!round) return { error: "Die Runde gibt es nicht mehr. Bitte Seite neu laden." };

  const selection = validateSelection(input.starts, gridDays(round.interviewsFrom, round.interviewsUntil));
  if ("error" in selection) return selection;

  const existing = await session
    .from("availabilities")
    .select("id, starts_at")
    .eq("round_id", round.id)
    .eq("member_id", member.id);
  if (existing.error) return { error: `Speichern fehlgeschlagen: ${existing.error.message}` };

  const wanted = new Set(selection.value);
  const have = new Set(existing.data.map((row) => normalizeInstant(row.starts_at)!));
  const removed = existing.data.filter((row) => !wanted.has(normalizeInstant(row.starts_at)!)).map((row) => row.id);
  const added = selection.value
    .filter((start) => !have.has(start))
    .map((start) => ({ round_id: round.id, member_id: member.id, starts_at: start, ends_at: cellEnd(start) }));

  if (removed.length) {
    const { error } = await session.from("availabilities").delete().in("id", removed);
    if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };
  }
  if (added.length) {
    const { error } = await session
      .from("availabilities")
      .upsert(added, { onConflict: "round_id,member_id,starts_at", ignoreDuplicates: true });
    if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };
  }

  const { error } = await session
    .from("member_round_settings")
    .upsert({ round_id: round.id, member_id: member.id, max_interviews: max.value }, { onConflict: "round_id,member_id" });
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };
  return { ok: true };
}
