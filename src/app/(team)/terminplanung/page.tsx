// Admin scheduling. Phase 11: capacity, interviewers and slots (list with a
// dialog, variant B); Phase 9: locations and blocked times.
import { getMember } from "@/lib/auth/member";
import { loadPlanningRound } from "@/lib/availability";
import { utcToBerlin } from "@/lib/berlin-time";
import { DEFAULT_LOCATION } from "@/lib/locations";
import { hintContext, loadScheduling } from "@/lib/scheduling";
import { capacity, hintText, isBookable, slotHints } from "@/lib/scheduling-rules";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../brand";
import { lead, listGroup, noticeBox, section, sectionTitle, teamPage } from "../../ui";
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

function period(startsAt: string, endsAt: string): string {
  const end = berlinDay(startsAt) === berlinDay(endsAt) ? time.format(new Date(endsAt)) : when.format(new Date(endsAt));
  return `${when.format(new Date(startsAt))} – ${end} Uhr`;
}

export default async function PlanningPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={teamPage}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  const round = await loadPlanningRound(supabase);
  if (!round) {
    return (
      <main className={teamPage}>
        <PageHeader heading="Terminplanung">Es gibt noch keine Runde. Bitte lege sie zuerst unter „Runde“ an.</PageHeader>
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
    <main className={teamPage}>
      <PageHeader heading="Terminplanung" />

      <section className={section}>
        <h2 className={sectionTitle}>Kapazität</h2>
        <p className={lead}>
          Alle Termine sind sofort buchbar, auch während der Bewerbungsphase. Das Paar wählt das Tool bei der Buchung.
        </p>
        <dl className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {[
            ["Bewerbungen", cap.applications],
            ["gebucht", cap.booked],
            ["ohne Termin", cap.withoutSlot],
            ["freie Termine", cap.free],
            ["davon buchbar", cap.bookable],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse justify-end gap-1 rounded-group bg-surface p-4">
              <dt className="text-small text-muted">{label}</dt>
              <dd className="text-stat font-semibold tracking-[-0.02em] tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {cap.bookable < cap.withoutSlot && (
          <p className={noticeBox}>
            Es gibt weniger buchbare Termine ({cap.bookable}) als Bewerber ohne Termin ({cap.withoutSlot}). Bitte das Team um mehr
            Verfügbarkeit bitten und danach erneut „Alle möglichen Termine erzeugen“ klicken.
          </p>
        )}
        <InviteToBookButton roundId={round.id} waiting={cap.withoutSlot} />
      </section>

      <section className={section}>
        <h2 className={sectionTitle}>Gesprächsführer</h2>
        <p className={lead}>
          Bei jeder Buchung bekommt das Paar mit den bisher wenigsten Gesprächen den Termin. „Bevorzugt“ zählt dabei als
          unbelastet.
        </p>
        {activeMembers.length ? (
          <ul className={listGroup}>
            {activeMembers.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div>{m.name}</div>
                  <div className="text-note text-muted tabular-nums">
                    {(m.cells.length / 4).toLocaleString("de-DE")} Std. verfügbar · Obergrenze {m.maxInterviews ?? "keine"} ·{" "}
                    {bookedCount(m.id)} gebucht
                  </div>
                </div>
                <PreferredToggle roundId={round.id} memberId={m.id} preferred={m.preferred} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={lead}>Noch keine aktiven Mitglieder.</p>
        )}
      </section>

      <section className={section}>
        <h2 className={sectionTitle}>Termine</h2>
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
          <p className={lead}>Lege zuerst unten einen Ort an.</p>
        )}
      </section>

      <section className={section}>
        <h2 className={sectionTitle}>Orte</h2>
        <p className={lead}>An einem Ort findet immer nur ein Gespräch gleichzeitig statt.</p>
        {locations.length === 0 && (
          <div className="pt-1">
            <AddLocationForm roundId={round.id} suggestion={DEFAULT_LOCATION} />
          </div>
        )}
        {locations.length > 0 && (
          <ul className={listGroup}>
          {locations.map((location) => (
            <li key={location.id} className="px-4 py-3">
              <LocationActions id={location.id} name={location.name} isDefault={location.isDefault} />
            </li>
          ))}
          </ul>
        )}
        {locations.length > 0 && <AddLocationForm roundId={round.id} />}
      </section>

      <section className={section}>
        <h2 className={sectionTitle}>Sperrzeiten</h2>
        <p className={lead}>
          Zeiten, in denen ein Ort belegt ist, etwa wegen Beratungen. Dort entstehen keine Gesprächstermine; im Raster der
          Verfügbarkeit erscheinen sie schraffiert.
        </p>
        {locations.length ? (
          <AddBlockedTimeForm locations={locations.map((l) => ({ id: l.id, name: l.name }))} defaultDay={round.interviewsFrom} />
        ) : (
          <p className={lead}>Lege zuerst einen Ort an.</p>
        )}
        {blocked.length > 0 && (
        <ul className={`mt-2 ${listGroup}`}>
          {blocked.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {b.location}: {period(b.startsAt, b.endsAt)}
                </div>
                {b.note && <div className="text-note text-muted">{b.note}</div>}
              </div>
              <DeleteBlockedTimeButton id={b.id} />
            </li>
          ))}
        </ul>
        )}
      </section>
    </main>
  );
}
