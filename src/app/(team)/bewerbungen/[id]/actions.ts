"use server";

// Applicant detail: the member's session, RLS decides (src/lib/applicant-team.ts).
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { deleteApplicantAsAdmin, setConflict, setStatus, type TeamResult } from "@/lib/applicant-team";
import { createClient } from "@/lib/supabase/server";

type State = { error: string };

function toState(result: TeamResult, id: string): State {
  if ("error" in result) return result;
  revalidatePath(`/bewerbungen/${id}`);
  revalidatePath("/bewerbungen");
  revalidatePath("/");
  revalidatePath("/terminplanung");
  return { error: "" };
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export async function setConflictAction(_prev: State, formData: FormData): Promise<State> {
  const id = field(formData, "id");
  return toState(await setConflict(await createClient(), id, field(formData, "conflicted") === "1"), id);
}

export async function setStatusAction(_prev: State, formData: FormData): Promise<State> {
  const id = field(formData, "id");
  const status = field(formData, "status") === "no_show" ? "no_show" : "active";
  return toState(await setStatus(await createClient(), id, status), id);
}

export async function deleteApplicantAction(_prev: State, formData: FormData): Promise<State> {
  const id = field(formData, "id");
  const result = toState(await deleteApplicantAsAdmin(await createClient(), id), id);
  if (result.error) return result;
  redirect("/bewerbungen?geloescht=1", RedirectType.replace);
}
