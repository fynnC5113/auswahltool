"use server";

// Applicant page: every call checks the token first (src/lib/application.ts).
import type { PrepareState, SubmitState } from "@/app/bewerben/application-form";
import { coerceFields } from "@/lib/application-form";
import { prepareCvReplacement, updateApplication, withdrawApplication, type EditResult } from "@/lib/application";
import { bookSlot, type BookResult } from "@/lib/booking";
import { createAdminClient } from "@/lib/supabase/admin";

const NOT_FOUND = { status: "invalid", errors: { form: "Dieser Link ist ungültig." } } as const;

function toState(result: EditResult): SubmitState {
  if (result.status === "notfound") return NOT_FOUND;
  if (result.status === "upload") return { status: "invalid", errors: {} };
  if (result.status === "done") return { status: "done", mailSent: true };
  return result;
}

export async function prepareEdit(token: string): Promise<PrepareState> {
  const result = await prepareCvReplacement(createAdminClient(), String(token));
  if (result.status === "upload") return { status: "upload", ref: result.path, path: result.path, token: result.token };
  if (result.status === "closed" || result.status === "invalid") return result;
  return NOT_FOUND;
}

export async function saveEdit(token: string, raw: unknown, newCvPath: string | null): Promise<SubmitState> {
  const path = typeof newCvPath === "string" ? newCvPath : null;
  return toState(await updateApplication(createAdminClient(), String(token), coerceFields(raw), path));
}

export async function withdraw(token: string): Promise<boolean> {
  return withdrawApplication(createAdminClient(), String(token));
}

export async function book(token: string, slotId: string): Promise<BookResult> {
  return bookSlot(createAdminClient(), String(token), String(slotId));
}
