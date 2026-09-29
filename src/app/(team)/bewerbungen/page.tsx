// Applications for the whole team (Phase 13, variant A, Fynn 29.09.2026):
// search in names and answers, filters for cohort, department and status.
import Link from "next/link";
import { loadTeamList } from "@/lib/applicant-team";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { link, okBox, teamPage } from "../../ui";
import { ApplicantList } from "./applicant-list";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ geloescht?: string }> }) {
  const { geloescht } = await searchParams;
  const supabase = await createClient();
  const { member } = await getMember(supabase);
  const list = member ? await loadTeamList(supabase) : null;

  return (
    <main className={teamPage}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-title font-bold tracking-[-0.01em]">Bewerbungen{list ? ` (${list.items.length})` : ""}</h1>
        {member?.role === "admin" && (
          <Link href="/einstellungen/erfassen" className={`text-note ${link}`}>
            Bewerbung erfassen
          </Link>
        )}
      </div>
      {geloescht && <p className={okBox}>Die Bewerbung ist gelöscht.</p>}
      {!list && <p>Es gibt noch keine Runde.</p>}
      {list && list.items.length === 0 && <p>Noch keine Bewerbungen.</p>}
      {list && list.items.length > 0 && <ApplicantList items={list.items} departments={list.round.departments} />}
    </main>
  );
}
