"use server";

// Admin actions around feedback (Phase 14), used on the overview and on
// /bewerbungen/[id]. The member's session, RLS decides (src/lib/feedback.ts).
import { revalidatePath } from "next/cache";
import { liftSightLock, startSelection, type AdminResult } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/server";

type State = { error: string };

function toState(result: AdminResult, applicantId?: string): State {
  if ("error" in result) return result;
  revalidatePath("/");
  revalidatePath("/gespraeche");
  if (applicantId) revalidatePath(`/bewerbungen/${applicantId}`);
  return { error: "" };
}

export async function liftSightLockAction(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get("id") ?? "");
  return toState(await liftSightLock(await createClient(), id), id);
}

export async function startSelectionAction(_prev: State, formData: FormData): Promise<State> {
  return toState(await startSelection(await createClient(), String(formData.get("roundId") ?? "")));
}
