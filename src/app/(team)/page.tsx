// Overview (Phase 13, variant A, Fynn 29.09.2026): where the round stands,
// five numbers, and hints for admins. Phase 14: missing feedback with
// "Sperre aufheben" and "Auswahlrunde starten" for admins.
import Link from "next/link";
import type { ReactNode } from "react";
import { getMember } from "@/lib/auth/member";
import { loadMissingFeedback } from "@/lib/feedback";
import { loadOverview } from "@/lib/overview";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../brand";
import { lead, link, listGroup, listRow, okText, section, sectionTitle, teamPage } from "../ui";
import { LiftButton, StartSelectionButton } from "./feedback-admin";

const when = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

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
  const feedback = overview ? await loadMissingFeedback(supabase, overview.roundId) : null;
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
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              <Stat value={overview.capacity.applications} label="Bewerbungen" />
              <Stat value={overview.capacity.booked} label="mit Termin" />
              <Stat value={overview.capacity.withoutSlot} label="ohne Termin" />
              <Stat value={overview.capacity.bookable} label="freie Termine buchbar" />
              <Stat value={feedback?.count ?? 0} label={feedback?.count === 1 ? "Feedback fehlt" : "Feedbacks fehlen"} />
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

          {isAdmin && feedback && (
            <section className={section}>
              <h2 className={sectionTitle}>Feedback fehlt</h2>
              <p className={lead}>
                Beendete Gespräche ohne „nicht erschienen“. „Sperre aufheben“ zeigt das vorhandene Feedback auch dem
                Gesprächsführer, der noch nicht abgegeben hat.
              </p>
              {feedback.rows.length === 0 ? (
                <p className={okText}>Kein Feedback offen.</p>
              ) : (
                <div className={listGroup}>
                  {feedback.rows.map((r) => (
                    <div key={r.applicantId} className={`flex items-center gap-3 ${listRow}`}>
                      <div className="min-w-0 flex-1">
                        <Link href={`/bewerbungen/${r.applicantId}`} className="font-medium">
                          {r.applicantName}
                        </Link>
                        <p className="text-small text-muted tabular-nums">
                          {when.format(new Date(r.startsAt))} · fehlt von{" "}
                          {r.missing.map((m) => (m.draft ? `${m.name} (Entwurf)` : m.name)).join(" und ")}
                        </p>
                        {r.lifted && <p className="text-small font-medium text-ok">Sperre aufgehoben</p>}
                      </div>
                      {!r.lifted && !overview.selectionStarted && <LiftButton applicantId={r.applicantId} />}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {isAdmin && !overview.selectionStarted && (
            <section className={section}>
              <h2 className={sectionTitle}>Auswahlrunde</h2>
              <p className={lead}>
                Mit dem Start sieht jedes Mitglied jedes abgegebene Feedback. Das lässt sich nicht rückgängig machen.
              </p>
              <div className="pt-1">
                <StartSelectionButton roundId={overview.roundId} missing={feedback?.count ?? 0} />
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
