// Test helpers for Phase 5 tests against "auswahltool-test": create team
// members and sign them in without mail (generateLink + verifyOtp).
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishableKey || !secretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be set in .env.local",
  );
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const admin = createClient(url, secretKey, noSession);

export function testEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.invalid`;
}

/** Auth user plus team_members row; returns the id. */
export async function createMember(email: string, role: "admin" | "member", active = true): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message ?? "createUser returned no user");
  const insert = await admin.from("team_members").insert({ id: data.user.id, email, name: `Test ${role}`, role, active });
  if (insert.error) throw new Error(insert.error.message);
  return data.user.id;
}

/** Redeems a hashed token the way /auth/confirm does. */
export async function redeem(tokenHash: string): Promise<SupabaseClient> {
  const client = createClient(url!, publishableKey!, noSession);
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) throw new Error(error.message);
  return client;
}

export async function signIn(email: string): Promise<SupabaseClient> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(link.error.message);
  return redeem(link.data.properties.hashed_token);
}

/** Deleting the auth user cascades to team_members. */
export async function deleteUsersByEmail(emails: string[]): Promise<void> {
  if (!emails.length) return;
  const { data } = await admin.from("team_members").select("id").in("email", emails);
  for (const { id } of data ?? []) await admin.auth.admin.deleteUser(id);
}
