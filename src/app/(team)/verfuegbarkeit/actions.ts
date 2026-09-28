"use server";

import { revalidatePath } from "next/cache";
import { saveAvailability, type AvailabilityResult } from "@/lib/availability";
import { createClient } from "@/lib/supabase/server";

export async function saveAvailabilityAction(input: {
  roundId: string;
  starts: string[];
  maxInterviews: string;
}): Promise<AvailabilityResult> {
  const result = await saveAvailability(await createClient(), input);
  if ("ok" in result) revalidatePath("/verfuegbarkeit");
  return result;
}
