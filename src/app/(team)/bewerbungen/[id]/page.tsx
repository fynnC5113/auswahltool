// One application for the team (Phase 13, variant A, Fynn 29.09.2026): one
// long page with CV, conflict of interest, slot, answers; status and deletion
// for admins. Phase 14: feedback (sight lock) and "Sperre aufheben".
import Link from "next/link";
import { loadTeamApplicant } from "@/lib/applicant-team";
import { getMember } from "@/lib/auth/member";
import { loadApplicantFeedback } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/server";
import { button, chip, lead, link, listGroup, listRow, noticeBox, readLabel, section, sectionTitle, teamPage, title } from "../../../ui";
import { LiftButton } from "../../feedback-admin";
import { ConflictButton, DeleteButton, StatusSwitch } from "./applicant-actions";
import { FeedbackSection } from "./feedback-section";

const when = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
export default async function ApplicantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { member } = await getMember(supabase);
  const applicant = member ? await loadTeamApplicant(supabase, id) : null;

  if (!member || !applicant) {
    return (
      <main className={teamPage}>
        <p>Diese Bewerbung gibt es nicht (mehr).</p>
        <Link href="/bewerbungen" className={link}>
          Zu den Bewerbungen
        </Link>
      </main>
    );
  }

  const feedback = await loadApplicantFeedback(supabase, applicant.id, applicant.roundId);
  const now = new Date();
  const selectionStarted = !!feedback.selectionStartedAt && new Date(feedback.selectionStartedAt) <= now;
  const isAdmin = member.role === "admin";
  // Seen from here: an admin who interviewed and has not submitted may not see the partner's entry.
  const allSubmitted = !!applicant.slot?.interviewers.every((m) =>
    feedback.entries.some((e) => e.memberId === m.id && e.submittedAt),
  );
  const mine = applicant.conflicts.some((c) => c.memberId === member.id);
  const leading = !!applicant.slot?.interviewers.some((m) => m.id === member.id);
  const departments = applicant.departmentAll
    ? "Ressort: für alle offen"
    : applicant.departmentUnsure
      ? "Ressort: weiß noch nicht"
    : applicant.departments.join(", ") || "kein Ressort";

  return (
    <main className={teamPage}>
      <div className="flex flex-col gap-1.5">
        <Link href="/bewerbungen" className={`self-start pb-2 text-note ${link}`}>
          ‹ Bewerbungen
        </Link>
        <h1 className={title}>{applicant.name}</h1>
        <p className={`${lead} break-all`}>{applicant.email}</p>
        <p className={`${lead} flex flex-wrap items-center gap-x-2`}>
          <span>
            Jahrgang {applicant.cohort} · {departments}
          </span>
          {applicant.status === "no_show" && <span className={`${chip} bg-warn-soft text-warn`}>nicht erschienen</span>}
        </p>
      </div>

      <div>
        {applicant.hasCv ? (
          <a href={`/bewerbungen/${applicant.id}/lebenslauf`} target="_blank" rel="noreferrer" className={button}>
            Lebenslauf öffnen
          </a>
        ) : (
          <p className={lead}>Kein Lebenslauf hochgeladen.</p>
        )}
      </div>

      <section className={section}>
        <h2 className={sectionTitle}>Befangenheit</h2>
        {applicant.conflicts.length > 0 && (
          <p className={noticeBox}>Befangen: {applicant.conflicts.map((c) => c.name).join(", ")}</p>
        )}
        {mine && leading && (
          <p className={noticeBox}>Du bist für dieses Gespräch eingeteilt. Die Admins sehen einen Hinweis und teilen um.</p>
        )}
        <p className={lead}>Wer befangen ist, sieht die Unterlagen weiter, wird aber nicht als Gesprächsführer eingeteilt.</p>
        <div className="pt-1">
          <ConflictButton id={applicant.id} mine={mine} />
        </div>
      </section>

      <section className={section}>
        <h2 className={sectionTitle}>Termin</h2>
        {applicant.slot ? (
          <dl className={listGroup}>
            <div className={listRow}>
              <dt className={readLabel}>Wann</dt>
              <dd className="tabular-nums">{when.format(new Date(applicant.slot.startsAt))} Uhr</dd>
            </div>
            <div className={listRow}>
              <dt className={readLabel}>Ort</dt>
              <dd>{applicant.slot.location}</dd>
            </div>
            <div className={listRow}>
              <dt className={readLabel}>Gespräch</dt>
              <dd>{applicant.slot.interviewers.map((m) => m.name).join(" und ")}</dd>
            </div>
          </dl>
        ) : (
          <p className={lead}>Noch kein Termin gebucht.</p>
        )}
      </section>

      <FeedbackSection feedback={feedback} memberId={member.id} slot={applicant.slot} now={now} />

      <section className={section}>
        <h2 className={sectionTitle}>Antworten</h2>
        <div className={listGroup}>
          {applicant.answers.map((a, i) => (
            <div key={i} className={listRow}>
              <p className={readLabel}>{a.question}</p>
              <p className="whitespace-pre-wrap">{a.text || "–"}</p>
            </div>
          ))}
        </div>
      </section>

      {isAdmin && (
        <section className={section}>
          <h2 className={sectionTitle}>Nur für Admins</h2>
          <div className="flex flex-col gap-4 rounded-group bg-surface p-4">
            <StatusSwitch id={applicant.id} status={applicant.status} />
            {applicant.slot && (
              <div className="flex flex-col gap-1.5">
                <span className={readLabel}>Sichtsperre</span>
                {feedback.lifted || selectionStarted ? (
                  <p className="text-note">{selectionStarted ? "Aufgehoben (Auswahlrunde läuft)." : "Aufgehoben."}</p>
                ) : allSubmitted ? (
                  <p className="text-note">Beide Gesprächsführer haben abgegeben.</p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={lead}>Zeigt den Gesprächsführern das Feedback des anderen, auch ohne eigene Abgabe.</p>
                    <LiftButton applicantId={applicant.id} />
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <DeleteButton id={applicant.id} name={applicant.name} booked={!!applicant.slot} />
              <p className={lead}>
                Löschen entfernt Bewerbung, Antworten und Lebenslauf endgültig. Ein gebuchter Termin wird frei, die
                Gesprächsführer bekommen eine Absage.
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
