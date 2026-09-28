// Plain list of applications for admins, to check incoming applications from
// 01.10. Phase 13 turns it into the team page with search and filters.
import Link from "next/link";
import { listApplications, loadApplicationRound } from "@/lib/application";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { page } from "../../ui";

const received = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={page}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  const round = await loadApplicationRound(supabase);
  const applications = round ? await listApplications(supabase, round.id) : [];

  return (
    <main className={page}>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Bewerbungen ({applications.length})</h1>
        <Link href="/einstellungen/erfassen" className="text-sm underline">
          Bewerbung erfassen
        </Link>
      </div>
      {!round && <p>Es gibt noch keine Runde.</p>}
      {round && applications.length === 0 && <p>Noch keine Bewerbungen.</p>}
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {applications.map((a) => (
          <li key={a.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">{a.name}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{received.format(new Date(a.createdAt))}</span>
            </div>
            <div className="text-sm break-all">{a.email}</div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Jahrgang {a.cohort} · {a.departmentUnsure ? "Ressort: weiß noch nicht" : a.departments.length ? a.departments.join(", ") : "kein Ressort"} ·{" "}
              {a.hasCv ? "PDF ✓" : "keine PDF"} · {a.source === "admin" ? "von Admin erfasst" : "Formular"}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
