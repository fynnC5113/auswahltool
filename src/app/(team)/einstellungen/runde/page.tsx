import { getMember } from "@/lib/auth/member";
import { loadRound } from "@/lib/round";
import { emptyForm } from "@/lib/round-form";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../brand";
import { teamPage } from "../../../ui";
import { RoundEditor } from "./round-form";

export default async function RoundPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={teamPage}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  // There is only one round at a time: the form edits the newest one.
  const round = await loadRound(supabase);

  return (
    <main className={teamPage}>
      <PageHeader heading={round ? "Runde bearbeiten" : "Runde anlegen"} />
      <RoundEditor initial={round ?? emptyForm(new Date().getFullYear())} />
    </main>
  );
}
