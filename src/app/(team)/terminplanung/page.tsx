// Admin scheduling. Phase 9: locations and blocked times; slots follow in Phase 11.
import { getMember } from "@/lib/auth/member";
import { loadPlanningRound } from "@/lib/availability";
import { DEFAULT_LOCATION, loadLocations } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { page } from "../../ui";
import { AddBlockedTimeForm, AddLocationForm, DeleteBlockedTimeButton, LocationActions } from "./planning-forms";

const when = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const berlinDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

function period(startsAt: string, endsAt: string): string {
  const end = berlinDay(startsAt) === berlinDay(endsAt) ? time.format(new Date(endsAt)) : when.format(new Date(endsAt));
  return `${when.format(new Date(startsAt))} – ${end} Uhr`;
}

export default async function PlanningPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={page}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  const round = await loadPlanningRound(supabase);
  if (!round) {
    return (
      <main className={page}>
        <h1 className="mb-4 text-2xl font-semibold">Terminplanung</h1>
        <p>Es gibt noch keine Runde. Bitte lege sie zuerst unter „Runde“ an.</p>
      </main>
    );
  }

  const locations = await loadLocations(supabase, round.id);
  const blocked = locations.flatMap((l) => l.blockedTimes.map((b) => ({ ...b, location: l.name }))).sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );

  return (
    <main className={page}>
      <h1 className="mb-6 text-2xl font-semibold">Terminplanung</h1>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-medium">Orte</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">An einem Ort findet immer nur ein Gespräch gleichzeitig statt.</p>
        {locations.length === 0 && (
          <div className="mb-4">
            <AddLocationForm roundId={round.id} suggestion={DEFAULT_LOCATION} />
          </div>
        )}
        <ul className="mb-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          {locations.map((location) => (
            <li key={location.id} className="py-3">
              <LocationActions id={location.id} name={location.name} isDefault={location.isDefault} />
            </li>
          ))}
        </ul>
        {locations.length > 0 && <AddLocationForm roundId={round.id} />}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">Sperrzeiten</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Zeiten, in denen ein Ort belegt ist, etwa wegen Beratungen. Dort entstehen keine Gesprächstermine; im Raster der
          Verfügbarkeit erscheinen sie grau.
        </p>
        {locations.length ? (
          <AddBlockedTimeForm locations={locations.map((l) => ({ id: l.id, name: l.name }))} defaultDay={round.interviewsFrom} />
        ) : (
          <p className="text-sm">Lege zuerst einen Ort an.</p>
        )}
        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {blocked.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {b.location}: {period(b.startsAt, b.endsAt)}
                </div>
                {b.note && <div className="text-sm text-zinc-600 dark:text-zinc-400">{b.note}</div>}
              </div>
              <DeleteBlockedTimeButton id={b.id} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
