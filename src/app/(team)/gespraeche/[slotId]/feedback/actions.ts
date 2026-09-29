"use server";

// Feedback form: called from the client (autosave and "Abgeben"). The
// member's session; public.save_feedback checks every rule again.
import { revalidatePath } from "next/cache";
import { saveFeedback, type SaveResult } from "@/lib/feedback";
import type { FeedbackInput } from "@/lib/feedback-rules";
import { createClient } from "@/lib/supabase/server";

/** The client sends plain data; keep only the expected shape. */
function clean(input: FeedbackInput): FeedbackInput {
  const scores = Array.isArray(input?.scores) ? input.scores : [];
  return {
    overall: String(input?.overall ?? ""),
    scores: scores.map((s) => ({
      criterionId: String(s?.criterionId ?? ""),
      score: Number.isInteger(s?.score) ? (s.score as number) : null,
      text: String(s?.text ?? ""),
    })),
  };
}

export async function saveFeedbackAction(applicantId: string, input: FeedbackInput, submit: boolean): Promise<SaveResult> {
  const result = await saveFeedback(await createClient(), String(applicantId), clean(input), submit === true);
  if (submit && "ok" in result) {
    revalidatePath("/gespraeche");
    revalidatePath(`/bewerbungen/${applicantId}`);
    revalidatePath("/");
  }
  return result;
}
