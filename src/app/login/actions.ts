"use server";

import { LOGIN_SENT_MESSAGE, requestLoginLink } from "@/lib/auth/login";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requestLogin(_prev: { message: string }, formData: FormData) {
  try {
    await requestLoginLink(String(formData.get("email") ?? ""), createAdminClient());
  } catch (error) {
    // Same answer either way, so the page does not reveal who is on the team.
    console.error("login link failed", error);
  }
  return { message: LOGIN_SENT_MESSAGE };
}
