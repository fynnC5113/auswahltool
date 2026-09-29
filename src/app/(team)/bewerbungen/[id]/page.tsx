// One application for the team (Phase 13, variant A, Fynn 29.09.2026): one
// long page with CV, conflict of interest, slot, answers; status and deletion
// for admins. Feedback follows in Phase 14.
import Link from "next/link";
import { loadTeamApplicant } from "@/lib/applicant-team";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { button, page } from "../../../ui";
import { ConflictButton, DeleteButton, StatusSwitch } from "./applicant-actions";

const when = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const muted = "text-sm text-zinc-600 dark:text-zinc-400";
const section = "flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800";
const hint = "rounded bg-amber-100 px-2 py-1 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200";

export default async function ApplicantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { member } = await getMember(supabase);
  const applicant = member ? await loadTeamApplicant(supabase, id) : null;

  if (!member || !applicant) {
    return (
      <main className={page}>
        <p className="mb-4">Diese Bewerbung gibt es nicht (mehr).</p>
        <Link href="/bewerbungen" className="underline">
          Zu den Bewerbungen
        </Link>
      </main>
    );
  }

  const isAdmin = member.role === "admin";
  const mine = applicant.conflicts.some((c) => c.memberId === member.id);
  const leading = !!applicant.slot?.interviewers.some((m) => m.id === member.id);
  const departments = applicant.departmentUnsure
    ? "Ressort: weiß noch nicht"
    : applicant.departments.join(", ") || "kein Ressort";

  return (
    <main className={page}>
      <p className="mb-2">
        <Link href="/bewerbungen" className="text-sm underline">
          ← Bewerbungen
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">{applicant.name}</h1>
      <p className={`${muted} break-all`}>{applicant.email}</p>
      <p className={`${muted} mb-4`}>
        Jahrgang {applicant.cohort} · {departments}
        {applicant.status === "no_show" && (
          <>
            {" · "}
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              nicht erschienen
            </span>
          </>
        )}
      </p>

      <div className="flex flex-col gap-5">
        <div>
          {applicant.hasCv ? (
            <a href={`/bewerbungen/${applicant.id}/lebenslauf`} target="_blank" rel="noreferrer" className={`${button} inline-block`}>
              Lebenslauf öffnen
            </a>
          ) : (
            <p className={muted}>Kein Lebenslauf hochgeladen.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {applicant.conflicts.length > 0 && (
            <p className={hint}>Befangen: {applicant.conflicts.map((c) => c.name).join(", ")}</p>
          )}
          {mine && leading && (
            <p className={hint}>Du bist für dieses Gespräch eingeteilt. Die Admins sehen einen Hinweis und teilen um.</p>
          )}
          <ConflictButton id={applicant.id} mine={mine} />
          <p className={muted}>Wer befangen ist, sieht die Unterlagen weiter, wird aber nicht als Gesprächsführer eingeteilt.</p>
        </div>

        <section className={section}>
          <h2 className="font-semibold">Termin</h2>
          {applicant.slot ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-zinc-600 dark:text-zinc-400">Wann</dt>
              <dd>{when.format(new Date(applicant.slot.startsAt))} Uhr</dd>
              <dt className="text-zinc-600 dark:text-zinc-400">Ort</dt>
              <dd>{applicant.slot.location}</dd>
              <dt className="text-zinc-600 dark:text-zinc-400">Gespräch</dt>
              <dd>{applicant.slot.interviewers.map((m) => m.name).join(" und ")}</dd>
            </dl>
          ) : (
            <p className={muted}>Noch kein Termin gebucht.</p>
          )}
        </section>

        <section className={section}>
          <h2 className="font-semibold">Antworten</h2>
          {applicant.answers.map((a, i) => (
            <div key={i}>
              <p className={muted}>{a.question}</p>
              <p className="whitespace-pre-wrap">{a.text || "–"}</p>
            </div>
          ))}
        </section>

        {isAdmin && (
          <section className={section}>
            <h2 className="font-semibold">Nur für Admins</h2>
            <StatusSwitch id={applicant.id} status={applicant.status} />
            <DeleteButton id={applicant.id} name={applicant.name} booked={!!applicant.slot} />
            <p className={muted}>
              Löschen entfernt Bewerbung, Antworten und Lebenslauf endgültig. Ein gebuchter Termin wird frei, die
              Gesprächsführer bekommen eine Absage.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
