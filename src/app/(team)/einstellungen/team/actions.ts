"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addMember, setActive, setRole, type TeamResult } from "@/lib/team";

type State = { error: string };

function toState(result: TeamResult): State {
  if ("error" in result) return result;
  revalidatePath("/einstellungen/team");
  return { error: "" };
}

export async function addMemberAction(_prev: State, formData: FormData): Promise<State> {
  const result = await addMember(await createClient(), createAdminClient(), {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  });
  return toState(result);
}

export async function setActiveAction(_prev: State, formData: FormData): Promise<State> {
  const result = await setActive(await createClient(), String(formData.get("id")), formData.get("active") === "true");
  return toState(result);
}

export async function setRoleAction(_prev: State, formData: FormData): Promise<State> {
  const result = await setRole(await createClient(), String(formData.get("id")), String(formData.get("role")));
  return toState(result);
}
