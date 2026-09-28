import { getMember } from "@/lib/auth/member";
import { loadRound } from "@/lib/round";
import { emptyForm } from "@/lib/round-form";
import { createClient } from "@/lib/supabase/server";
import { page } from "../../../ui";
import { RoundEditor } from "./round-form";

export default async function RoundPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={page}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  // There is only one round at a time: the form edits the newest one.
  const round = await loadRound(supabase);

  return (
    <main className={page}>
      <h1 className="mb-6 text-2xl font-semibold">{round ? "Runde bearbeiten" : "Runde anlegen"}</h1>
      <RoundEditor initial={round ?? emptyForm(new Date().getFullYear())} />
    </main>
  );
}
