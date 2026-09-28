"use server";

// Public form: the secret-key client, after the checks in src/lib/application.ts.
import { coerceFields } from "@/lib/application-form";
import { prepareApplication, submitApplication } from "@/lib/application";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PrepareState, SubmitState } from "./application-form";

export async function prepareApply(raw: unknown): Promise<PrepareState> {
  const result = await prepareApplication(createAdminClient(), coerceFields(raw), "form");
  return result.status === "upload" ? { status: "upload", ref: result.applicantId, path: result.path, token: result.token } : result;
}

export async function submitApply(raw: unknown, applicantId: string | null): Promise<SubmitState> {
  return submitApplication(createAdminClient(), coerceFields(raw), String(applicantId), "form");
}
