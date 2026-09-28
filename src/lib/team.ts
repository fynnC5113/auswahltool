// Team administration (/einstellungen/team). Writes go through the admin's
// session, so RLS enforces "admins only"; only creating the auth user needs
// the secret key, and that happens after the admin check.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/auth/login";
import { getMember, type Role } from "@/lib/auth/member";

export type TeamResult = { error: string } | { ok: true };

const NOT_ALLOWED: TeamResult = { error: "Das dürfen nur Admins." };

async function adminId(session: SupabaseClient): Promise<string | null> {
  const { member } = await getMember(session);
  return member?.role === "admin" ? member.id : null;
}

function isRole(value: string): value is Role {
  return value === "admin" || value === "member";
}

export async function addMember(
  session: SupabaseClient,
  admin: SupabaseClient,
  input: { name: string; email: string; role: string },
): Promise<TeamResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (!name) return { error: "Bitte einen Namen eingeben." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Bitte eine gültige Mailadresse eingeben." };
  if (!isRole(input.role)) return { error: "Unbekannte Rolle." };
  if (!(await adminId(session))) return NOT_ALLOWED;

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) {
    if (created.error?.code === "email_exists") return { error: "Diese Adresse ist schon eingetragen." };
    return { error: `Anlegen fehlgeschlagen: ${created.error?.message ?? "unbekannter Fehler"}` };
  }

  const userId = created.data.user.id;
  const { error } = await session.from("team_members").insert({ id: userId, email, name, role: input.role });
  if (error) {
    await admin.auth.admin.deleteUser(userId);
    return { error: `Anlegen fehlgeschlagen: ${error.message}` };
  }
  return { ok: true };
}

async function updateMember(
  session: SupabaseClient,
  memberId: string,
  changes: { active?: boolean; role?: Role },
): Promise<TeamResult> {
  const { data, error } = await session.from("team_members").update(changes).eq("id", memberId).select("id");
  if (error) return { error: error.message };
  // RLS filters the row away instead of raising an error.
  if (!data?.length) return NOT_ALLOWED;
  return { ok: true };
}

export async function setActive(session: SupabaseClient, memberId: string, active: boolean): Promise<TeamResult> {
  const self = await adminId(session);
  if (!self) return NOT_ALLOWED;
  if (!active && memberId === self) return { error: "Du kannst dich nicht selbst deaktivieren." };
  return updateMember(session, memberId, { active });
}

export async function setRole(session: SupabaseClient, memberId: string, role: string): Promise<TeamResult> {
  if (!isRole(role)) return { error: "Unbekannte Rolle." };
  const self = await adminId(session);
  if (!self) return NOT_ALLOWED;
  if (role === "member" && memberId === self) return { error: "Du kannst dir die Admin-Rolle nicht selbst entziehen." };
  return updateMember(session, memberId, { role });
}
