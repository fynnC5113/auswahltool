// Placeholder until the overview is built (Phase 13).
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { page } from "../ui";

export default async function OverviewPage() {
  const { member } = await getMember(await createClient());

  return (
    <main className={page}>
      <h1 className="mb-4 text-2xl font-semibold">Übersicht</h1>
      <p>Hallo {member?.name}, du bist angemeldet.</p>
    </main>
  );
}
