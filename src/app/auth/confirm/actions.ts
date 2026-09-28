"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function confirmLogin(_prev: { error: string }, formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) return { error: "Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an." };
  redirect("/");
}
