"use server";

import { revalidatePath } from "next/cache";
import {
  addBlockedTime,
  addLocation,
  deleteBlockedTime,
  deleteLocation,
  renameLocation,
  setDefaultLocation,
  type LocationResult,
} from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";

type State = { error: string };

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function toState(result: LocationResult): State {
  if ("error" in result) return result;
  revalidatePath("/terminplanung");
  revalidatePath("/verfuegbarkeit");
  return { error: "" };
}

export async function addLocationAction(_prev: State, formData: FormData): Promise<State> {
  return toState(await addLocation(await createClient(), field(formData, "roundId"), field(formData, "name")));
}

export async function renameLocationAction(_prev: State, formData: FormData): Promise<State> {
  return toState(await renameLocation(await createClient(), field(formData, "id"), field(formData, "name")));
}

export async function setDefaultLocationAction(_prev: State, formData: FormData): Promise<State> {
  return toState(await setDefaultLocation(await createClient(), field(formData, "id")));
}

export async function deleteLocationAction(_prev: State, formData: FormData): Promise<State> {
  return toState(await deleteLocation(await createClient(), field(formData, "id")));
}

export async function addBlockedTimeAction(_prev: State, formData: FormData): Promise<State> {
  return toState(
    await addBlockedTime(await createClient(), {
      locationId: field(formData, "locationId"),
      startsAt: field(formData, "startsAt"),
      endsAt: field(formData, "endsAt"),
      note: field(formData, "note"),
    }),
  );
}

export async function deleteBlockedTimeAction(_prev: State, formData: FormData): Promise<State> {
  return toState(await deleteBlockedTime(await createClient(), field(formData, "id")));
}
