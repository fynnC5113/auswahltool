"use server";

// Admin entry: the admin's session, RLS decides (TECH_DESIGN 2).
import type { PrepareState, SubmitState } from "@/app/bewerben/application-form";
import { coerceFields } from "@/lib/application-form";
import { prepareApplication, submitApplication } from "@/lib/application";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

const ADMINS_ONLY = { status: "invalid", errors: { form: "Nur Admins können Bewerbungen erfassen." } } as const;

async function adminSession() {
  const session = await createClient();
  const { member } = await getMember(session);
  return member?.role === "admin" ? session : null;
}

export async function prepareCapture(raw: unknown): Promise<PrepareState> {
  const session = await adminSession();
  if (!session) return ADMINS_ONLY;
  const result = await prepareApplication(session, coerceFields(raw), "admin");
  return result.status === "upload" ? { status: "upload", ref: result.applicantId, path: result.path, token: result.token } : result;
}

export async function submitCapture(raw: unknown, applicantId: string | null): Promise<SubmitState> {
  const session = await adminSession();
  if (!session) return ADMINS_ONLY;
  return submitApplication(session, coerceFields(raw), String(applicantId), "admin");
}
