// Admin scheduling. Phase 11: capacity, interviewers and slots (list with a
// dialog, variant B); Phase 9: locations and blocked times.
import { getMember } from "@/lib/auth/member";
import { loadPlanningRound } from "@/lib/availability";
import { utcToBerlin } from "@/lib/berlin-time";
import { DEFAULT_LOCATION } from "@/lib/locations";
import { hintContext, loadScheduling } from "@/lib/scheduling";
import { capacity, hintText, isBookable, slotHints } from "@/lib/scheduling-rules";
import { createClient } from "@/lib/supabase/server";
import { page } from "../../ui";
import { AddBlockedTimeForm, AddLocationForm, DeleteBlockedTimeButton, LocationActions } from "./planning-forms";
import { InviteToBookButton, PreferredToggle, SlotBoard, type BoardSlot } from "./slot-board";

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
const dayLabel = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
const muted = "text-sm text-zinc-600 dark:text-zinc-400";

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

  const data = await loadScheduling(supabase, round.id);
  const { locations } = data;
  const context = hintContext(data);
  const cap = capacity(data.applicants.length, context);
  const nameOf = (id: string) => data.members.find((m) => m.id === id)?.name ?? "Unbekannt";
  const applicantName = new Map(data.applicants.map((a) => [a.id, a.name]));
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const bookedCount = (id: string) =>
    data.slots.filter((s) => s.applicantId && (s.interviewerA === id || s.interviewerB === id)).length;

  const slots: BoardSlot[] = data.slots
    .map((s) => ({
      id: s.id,
      day: dayLabel.format(new Date(s.startsAt)),
      time: time.format(new Date(s.startsAt)),
      end: time.format(new Date(s.interviewEndsAt)),
      local: utcToBerlin(s.startsAt),
      locationId: s.locationId,
      location: locationName.get(s.locationId) ?? "",
      interviewerA: s.interviewerA,
      interviewerB: s.interviewerB,
      pair: s.interviewerA && s.interviewerB ? `${nameOf(s.interviewerA)} & ${nameOf(s.interviewerB)}` : null,
      applicant: s.applicantId ? (applicantName.get(s.applicantId) ?? "") : null,
      bookable: isBookable(s, context),
      hints: slotHints(s, context).map((h) => hintText(h, nameOf)),
      sort: `${s.startsAt} ${locations.findIndex((l) => l.id === s.locationId)}`,
    }))
    .sort((a, b) => a.sort.localeCompare(b.sort));
  const booked = new Set(data.slots.map((s) => s.applicantId));
  const activeMembers = data.members.filter((m) => m.active);
  const blocked = locations.flatMap((l) => l.blockedTimes.map((b) => ({ ...b, location: l.name }))).sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );

  return (
    <main className={page}>
      <h1 className="mb-6 text-2xl font-semibold">Terminplanung</h1>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-medium">Kapazität</h2>
        <p className={`mb-3 ${muted}`}>
          Alle Termine sind sofort buchbar, auch während der Bewerbungsphase. Das Paar wählt das Tool bei der Buchung.
        </p>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Bewerbungen", cap.applications],
            ["gebucht", cap.booked],
            ["ohne Termin", cap.withoutSlot],
            ["freie Termine", cap.free],
            ["davon buchbar", cap.bookable],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              <dt className={muted}>{label}</dt>
            </div>
          ))}
        </dl>
        {cap.bookable < cap.withoutSlot && (
          <p className="mt-3 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Es gibt weniger buchbare Termine ({cap.bookable}) als Bewerber ohne Termin ({cap.withoutSlot}). Bitte das Team um mehr
            Verfügbarkeit bitten und danach erneut „Alle möglichen Termine erzeugen“ klicken.
          </p>
        )}
        <InviteToBookButton roundId={round.id} waiting={cap.withoutSlot} />
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-medium">Gesprächsführer</h2>
        <p className={`mb-3 ${muted}`}>
          Bei jeder Buchung bekommt das Paar mit den bisher wenigsten Gesprächen den Termin. „Bevorzugt“ zählt dabei als
          unbelastet.
        </p>
        {activeMembers.length ? (
          <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {activeMembers.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div>{m.name}</div>
                  <div className={`${muted} tabular-nums`}>
                    {(m.cells.length / 4).toLocaleString("de-DE")} Std. verfügbar · Obergrenze {m.maxInterviews ?? "keine"} ·{" "}
                    {bookedCount(m.id)} gebucht
                  </div>
                </div>
                <PreferredToggle roundId={round.id} memberId={m.id} preferred={m.preferred} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={muted}>Noch keine aktiven Mitglieder.</p>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Termine</h2>
        {locations.length ? (
          <SlotBoard
            roundId={round.id}
            slots={slots}
            members={data.members.map((m) => ({ id: m.id, name: m.name, active: m.active }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
            applicants={data.applicants.filter((a) => !booked.has(a.id))}
            newSlotDefault={`${round.interviewsFrom}T10:00`}
          />
        ) : (
          <p className={muted}>Lege zuerst unten einen Ort an.</p>
        )}
      </section>

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
