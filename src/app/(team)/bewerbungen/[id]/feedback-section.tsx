// Feedback on /bewerbungen/[id] (Phase 14): the entries the member may read
// (RLS, sight lock), the own draft, and why the partner's entry is hidden.
import Link from "next/link";
import type { ApplicantFeedback, FeedbackEntry } from "@/lib/feedback";
import { sightLocked } from "@/lib/feedback-rules";
import { lead, link, listGroup, listRow, readLabel, section, sectionTitle } from "../../../ui";

const stamp = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

function Entry({ entry, feedback, own }: { entry: FeedbackEntry; feedback: ApplicantFeedback; own: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-group bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-medium">{own ? "Du" : entry.name}</span>
        <span className="text-small text-muted tabular-nums">
          {entry.submittedAt ? `abgegeben ${stamp.format(new Date(entry.submittedAt))}` : "Entwurf, nur für dich sichtbar"}
        </span>
      </div>
      <dl className="flex flex-col gap-2">
        {feedback.criteria.map((c, i) => {
          const s = entry.scores[i];
          return (
            <div key={c.id}>
              <dt className="flex items-baseline justify-between gap-3">
                <span>{c.name}</span>
                <span className="font-semibold tabular-nums">
                  {s.score ?? "–"} <span className="text-small font-normal text-muted">/ {c.scaleMax}</span>
                </span>
              </dt>
              {s.text && <dd className="text-note whitespace-pre-wrap text-muted">{s.text}</dd>}
            </div>
          );
        })}
      </dl>
      <div>
        <p className={readLabel}>Gesamteindruck</p>
        <p className="text-note whitespace-pre-wrap">{entry.overall || "–"}</p>
      </div>
    </div>
  );
}

export function FeedbackSection({
  feedback,
  memberId,
  slot,
  now = new Date(),
}: {
  feedback: ApplicantFeedback;
  memberId: string;
  slot: { id: string; startsAt: string; interviewers: { id: string; name: string }[] } | null;
  now?: Date;
}) {
  const own = feedback.entries.find((e) => e.memberId === memberId);
  const others = feedback.entries.filter((e) => e.memberId !== memberId && e.submittedAt);
  const isInterviewer = !!slot?.interviewers.some((m) => m.id === memberId);
  const locked = sightLocked({
    isInterviewer,
    ownSubmitted: !!own?.submittedAt,
    lifted: feedback.lifted,
    selectionStartedAt: feedback.selectionStartedAt ? new Date(feedback.selectionStartedAt) : null,
    now,
  });
  const partners = (slot?.interviewers ?? []).filter((m) => m.id !== memberId);
  const pending = partners.filter((m) => !others.some((e) => e.memberId === m.id));
  const started = !!slot && new Date(slot.startsAt) <= now;

  return (
    <section className={section}>
      <h2 className={sectionTitle}>Feedback</h2>

      {isInterviewer && !own?.submittedAt && (
        <div className={listGroup}>
          <div className={`flex items-center gap-3 ${listRow}`}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Dein Feedback</p>
              <p className="text-small text-muted">{own ? "Entwurf, nur für dich sichtbar" : "Noch nicht begonnen"}</p>
            </div>
            {started && (
              <Link href={`/gespraeche/${slot!.id}/feedback`} className={`text-note ${link}`}>
                {own ? "Weiter ausfüllen" : "Feedback eintragen"}
              </Link>
            )}
          </div>
        </div>
      )}

      {locked && pending.length > 0 && (
        <p className="rounded-field bg-field px-4 py-3 text-note text-muted">
          Das Feedback von {pending.map((m) => m.name).join(" und ")} siehst du, sobald du dein eigenes abgegeben hast.
        </p>
      )}

      {(own?.submittedAt || others.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          {own?.submittedAt && <Entry entry={own} feedback={feedback} own />}
          {others.map((e) => (
            <Entry key={e.memberId} entry={e} feedback={feedback} own={false} />
          ))}
        </div>
      )}

      {!locked && slot && pending.length > 0 && (
        <p className={lead}>Noch nicht abgegeben: {pending.map((m) => m.name).join(", ")}.</p>
      )}
      {!slot && feedback.entries.length === 0 && <p className={lead}>Noch kein Gespräch, noch kein Feedback.</p>}
    </section>
  );
}
