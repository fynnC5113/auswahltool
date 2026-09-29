// Overview (Phase 13, variant A, Fynn 29.09.2026): where the round stands,
// four numbers, and hints for admins. Missing feedback follows in Phase 14.
import Link from "next/link";
import type { ReactNode } from "react";
import { getMember } from "@/lib/auth/member";
import { loadOverview } from "@/lib/overview";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../brand";
import { link, listGroup, listRow, okText, section, sectionTitle, teamPage } from "../ui";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-group bg-surface p-4">
      <div className="text-stat font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
      <div className="text-small text-muted">{label}</div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className={`flex gap-2.5 text-note ${listRow}`}>
      <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-warn" />
      <span>{children}</span>
    </p>
  );
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);
  const overview = member ? await loadOverview(supabase) : null;
  const isAdmin = member?.role === "admin";

  return (
    <main className={teamPage}>
      <PageHeader heading="Übersicht">{overview?.title}</PageHeader>
      {!overview ? (
        <p>Hallo {member?.name}, es gibt noch keine Runde.</p>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <p className={sectionTitle}>{overview.phase.title}</p>
            <p className="text-note text-muted">{overview.phase.text}</p>
          </div>

          <section className={section}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat value={overview.capacity.applications} label="Bewerbungen" />
              <Stat value={overview.capacity.booked} label="mit Termin" />
              <Stat value={overview.capacity.withoutSlot} label="ohne Termin" />
              <Stat value={overview.capacity.bookable} label="freie Termine buchbar" />
            </div>
            <p className="pt-1 text-note">
              <Link href="/bewerbungen" className={link}>
                Zu den Bewerbungen
              </Link>
            </p>
          </section>

          {isAdmin && (
            <section className={section}>
              <h2 className={sectionTitle}>Hinweise für Admins</h2>
              {overview.hints.length === 0 && !overview.capacityShort ? (
                <p className={okText}>Keine offenen Hinweise.</p>
              ) : (
                <>
                  <div className={listGroup}>
                    {overview.hints.map((h) => (
                      <Hint key={h}>{h}</Hint>
                    ))}
                    {overview.capacityShort && (
                      <Hint>
                        Weniger buchbare Termine ({overview.capacity.bookable}) als Bewerbungen ohne Termin ({overview.capacity.withoutSlot}).
                      </Hint>
                    )}
                  </div>
                  <p className="pt-1 text-note">
                    <Link href="/terminplanung" className={link}>
                      Zur Terminplanung
                    </Link>
                  </p>
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
