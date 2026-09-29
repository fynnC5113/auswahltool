// Overview (Phase 13, variant A, Fynn 29.09.2026): where the round stands,
// four numbers, and hints for admins. Missing feedback follows in Phase 14.
import Link from "next/link";
import { getMember } from "@/lib/auth/member";
import { loadOverview } from "@/lib/overview";
import { createClient } from "@/lib/supabase/server";
import { page } from "../ui";

const hint = "rounded bg-amber-100 px-2 py-1 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{label}</div>
    </div>
  );
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);
  const overview = member ? await loadOverview(supabase) : null;
  const isAdmin = member?.role === "admin";

  return (
    <main className={page}>
      <h1 className="mb-4 text-2xl font-semibold">Übersicht</h1>
      {!overview ? (
        <p>Hallo {member?.name}, es gibt noch keine Runde.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{overview.title}</p>
            <p className="text-lg">
              <span className="font-semibold">{overview.phase.title}</span> {overview.phase.text}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={overview.capacity.applications} label="Bewerbungen" />
            <Stat value={overview.capacity.booked} label="mit Termin" />
            <Stat value={overview.capacity.withoutSlot} label="ohne Termin" />
            <Stat value={overview.capacity.bookable} label="freie Termine buchbar" />
          </div>
          <p>
            <Link href="/bewerbungen" className="text-sm underline">
              Zu den Bewerbungen
            </Link>
          </p>

          {isAdmin && (
            <section className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h2 className="font-semibold">Hinweise für Admins</h2>
              {overview.hints.map((h) => (
                <p key={h} className={hint}>
                  {h}
                </p>
              ))}
              {overview.capacityShort && (
                <p className={hint}>
                  Weniger buchbare Termine ({overview.capacity.bookable}) als Bewerbungen ohne Termin (
                  {overview.capacity.withoutSlot}).
                </p>
              )}
              {overview.hints.length === 0 && !overview.capacityShort ? (
                <p className="rounded bg-green-100 px-2 py-1 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
                  Keine offenen Hinweise.
                </p>
              ) : (
                <p>
                  <Link href="/terminplanung" className="text-sm underline">
                    Zur Terminplanung
                  </Link>
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
