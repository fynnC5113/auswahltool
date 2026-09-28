// Who is signed in, and are they an active team member? Reads with the
// member's own session: for a deactivated member RLS returns no row.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Role = "admin" | "member";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** userId: verified session (or null). member: active team member (or null). */
export async function getMember(session: SupabaseClient): Promise<{ userId: string | null; member: Member | null }> {
  const { data } = await session.auth.getClaims();
  const userId = data?.claims?.sub ?? null;
  if (!userId) return { userId: null, member: null };

  const { data: member } = await session
    .from("team_members")
    .select("id, name, email, role")
    .eq("id", userId)
    .maybeSingle<Member>();
  return { userId, member: member ?? null };
}
