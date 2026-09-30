// "Einstellungen" (Phase 16, Fynn 30.09.2026): the admin pages under one menu
// entry, so the top row has room for "Board".
import Link from "next/link";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../brand";
import { listGroup, teamPage } from "../../ui";

const PAGES = [
  { href: "/einstellungen/runde", label: "Runde", note: "Fristen, Fragen, Ressorts, Kriterien, Plätze" },
  { href: "/einstellungen/team", label: "Team", note: "Mitglieder anlegen und verwalten" },
  { href: "/einstellungen/erfassen", label: "Erfassen", note: "Bewerbung von Hand eintragen" },
];

export default async function SettingsPage() {
  const { member } = await getMember(await createClient());
  if (member?.role !== "admin") {
    return (
      <main className={teamPage}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  return (
    <main className={teamPage}>
      <PageHeader heading="Einstellungen" />
      <nav className={listGroup} aria-label="Einstellungen">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} className="flex items-center gap-3 px-4 py-[11px] hover:bg-field">
            <span className="min-w-0 flex-1">
              <span className="block">{p.label}</span>
              <span className="block text-small text-muted">{p.note}</span>
            </span>
            <span className="text-muted" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
