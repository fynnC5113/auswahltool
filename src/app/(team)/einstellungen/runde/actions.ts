"use server";

import { revalidatePath } from "next/cache";
import { loadRound, saveRound } from "@/lib/round";
import type { FieldErrors, RoundForm } from "@/lib/round-form";
import { createClient } from "@/lib/supabase/server";

export type SaveRoundState = { ok: true; round: RoundForm } | { errors: FieldErrors; inUse?: string[] };

/** On success returns the saved round, so new items get their ids. */
export async function saveRoundAction(form: RoundForm): Promise<SaveRoundState> {
  const session = await createClient();
  const result = await saveRound(session, form);
  if (!("ok" in result)) return result;

  revalidatePath("/einstellungen/runde");
  const round = await loadRound(session, result.id);
  return round ? { ok: true, round } : { errors: { form: "Gespeichert, aber das Neuladen ist fehlgeschlagen. Bitte Seite neu laden." } };
}
