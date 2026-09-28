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
import {
  assignApplicant,
  deleteFreeSlots,
  deleteSlot,
  generateSlots,
  saveSlot,
  setPair,
  setPreferred,
  unassignApplicant,
  type SchedulingResult,
} from "@/lib/scheduling";
import { createClient } from "@/lib/supabase/server";

type State = { error: string; message?: string };

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

// ---------------------------------------------------------------------------
// Phase 11: slots
// ---------------------------------------------------------------------------

function slotState(result: SchedulingResult): State {
  if ("error" in result) return result;
  revalidatePath("/terminplanung");
  return { error: "" };
}

export async function generateSlotsAction(_prev: State, formData: FormData): Promise<State> {
  const result = await generateSlots(await createClient(), field(formData, "roundId"));
  if ("error" in result) return result;
  revalidatePath("/terminplanung");
  return {
    error: "",
    message: result.created
      ? `${result.created} ${result.created === 1 ? "Termin" : "Termine"} angelegt.`
      : "Keine weiteren Termine möglich. Mehr Termine entstehen, wenn das Team mehr Verfügbarkeit einträgt.",
  };
}

export async function deleteFreeSlotsAction(_prev: State, formData: FormData): Promise<State> {
  return slotState(await deleteFreeSlots(await createClient(), field(formData, "roundId")));
}

export async function saveSlotAction(_prev: State, formData: FormData): Promise<State> {
  return slotState(
    await saveSlot(await createClient(), {
      roundId: field(formData, "roundId"),
      id: field(formData, "id") || undefined,
      locationId: field(formData, "locationId"),
      startsAt: field(formData, "startsAt"),
      interviewerA: field(formData, "interviewerA"),
      interviewerB: field(formData, "interviewerB"),
    }),
  );
}

export async function setPairAction(_prev: State, formData: FormData): Promise<State> {
  return slotState(
    await setPair(await createClient(), field(formData, "id"), field(formData, "interviewerA"), field(formData, "interviewerB")),
  );
}

export async function deleteSlotAction(_prev: State, formData: FormData): Promise<State> {
  return slotState(await deleteSlot(await createClient(), field(formData, "id")));
}

export async function assignApplicantAction(_prev: State, formData: FormData): Promise<State> {
  return slotState(await assignApplicant(await createClient(), field(formData, "id"), field(formData, "applicantId")));
}

export async function unassignApplicantAction(_prev: State, formData: FormData): Promise<State> {
  return slotState(await unassignApplicant(await createClient(), field(formData, "id")));
}

export async function setPreferredAction(_prev: State, formData: FormData): Promise<State> {
  return slotState(
    await setPreferred(
      await createClient(),
      field(formData, "roundId"),
      field(formData, "memberId"),
      field(formData, "preferred") === "true",
    ),
  );
}
