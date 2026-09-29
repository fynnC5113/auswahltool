// Feedback for one of the member's own interviews (Phase 14, variant A).
// Only the two interviewers, from the start of the interview; no form for
// "nicht erschienen" or after the board is frozen.
import Link from "next/link";
import { loadFeedbackForm } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/server";
import { lead, link, noticeBox, teamPage, title } from "../../../../ui";
import { FeedbackForm } from "./feedback-form";

const when = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

export default async function FeedbackPage({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  const form = await loadFeedbackForm(await createClient(), slotId);
  const back = (
    <Link href="/gespraeche" className={`self-start pb-2 text-note ${link}`}>
      ‹ Meine Gespräche
    </Link>
  );

  if (!form) {
    return (
      <main className={teamPage}>
        {back}
        <p>Dieses Gespräch gibt es nicht (mehr), oder du bist dafür nicht eingeteilt.</p>
      </main>
    );
  }

  const { interview } = form;
  const started = new Date(interview.startsAt) <= new Date();

  return (
    <main className={teamPage}>
      <div className="flex flex-col gap-1.5">
        {back}
        <h1 className={title}>{interview.applicantName}</h1>
        <p className={`${lead} tabular-nums`}>
          {when.format(new Date(interview.startsAt))} Uhr · {interview.location} · mit {interview.partner} ·{" "}
          <Link href={`/bewerbungen/${interview.applicantId}`} className={link}>
            Bewerbung und Lebenslauf öffnen
          </Link>
        </p>
      </div>

      {interview.noShow ? (
        <p className={noticeBox}>Als „nicht erschienen“ markiert. Ein Feedback ist nicht nötig.</p>
      ) : form.frozen ? (
        <p className={noticeBox}>Das Board ist eingefroren. Feedback lässt sich nicht mehr ändern; du findest es auf der Bewerbung.</p>
      ) : !started ? (
        <p className={noticeBox}>Feedback kannst du ab Gesprächsbeginn ({when.format(new Date(interview.startsAt))} Uhr) eintragen.</p>
      ) : form.criteria.length === 0 ? (
        <p className={noticeBox}>Für diese Runde sind noch keine Kriterien festgelegt.</p>
      ) : (
        <FeedbackForm
          applicantId={interview.applicantId}
          partner={interview.partner}
          criteria={form.criteria}
          initial={form.input}
          initialSubmittedAt={form.submittedAt}
        />
      )}
    </main>
  );
}
