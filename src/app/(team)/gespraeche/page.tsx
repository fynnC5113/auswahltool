// Meine Gespräche (Phase 14, Fynn 29.09.2026): the member's own booked
// interviews, today first, then upcoming, then past with the feedback state.
import Link from "next/link";
import { loadMyInterviews, type MyInterview } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../brand";
import { chip, lead, listGroup, listRow, section, sectionTitle, teamPage } from "../../ui";

const day = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const berlinDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

function State({ interview, now }: { interview: MyInterview; now: Date }) {
  if (interview.noShow) return <span className={`${chip} bg-warn-soft text-warn`}>nicht erschienen</span>;
  if (interview.own === "submitted") return <span className={`${chip} bg-ok-soft text-ok`}>abgegeben</span>;
  if (interview.own === "draft") return <span className={chip}>Entwurf</span>;
  if (new Date(interview.interviewEndsAt) <= now) return <span className={`${chip} bg-warn-soft text-warn`}>Feedback fehlt</span>;
  return null;
}

function Group({ heading, interviews, now }: { heading: string; interviews: MyInterview[]; now: Date }) {
  if (!interviews.length) return null;
  return (
    <section className={section}>
      <h2 className={sectionTitle}>{heading}</h2>
      <div className={listGroup}>
        {interviews.map((i) => (
          <Link key={i.slotId} href={`/gespraeche/${i.slotId}/feedback`} className={`flex items-center gap-3 ${listRow}`}>
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular-nums">
                {day.format(new Date(i.startsAt))} · {time.format(new Date(i.startsAt))}–{time.format(new Date(i.interviewEndsAt))}
              </p>
              <p className="text-note">{i.applicantName}</p>
              <p className="text-small text-muted">
                {i.location} · mit {i.partner}
              </p>
            </div>
            <State interview={i} now={now} />
            <span aria-hidden className="text-section text-muted">
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function InterviewsPage() {
  const data = await loadMyInterviews(await createClient());
  const now = new Date();
  const today = berlinDate(now);
  const interviews = data?.interviews ?? [];
  const isToday = (i: MyInterview) => berlinDate(new Date(i.startsAt)) === today;

  return (
    <main className={teamPage}>
      <PageHeader heading="Meine Gespräche">
        {data ? `Deine Termine in der Runde „${data.title}“. Nach jedem Gespräch gibst du hier dein Feedback ab.` : undefined}
      </PageHeader>
      {!data ? (
        <p>Es gibt noch keine Runde.</p>
      ) : interviews.length === 0 ? (
        <p className={lead}>Du hast noch keine Gespräche. Sobald ein Bewerber einen Termin mit dir bucht, steht er hier.</p>
      ) : (
        <>
          <Group heading="Heute" interviews={interviews.filter(isToday)} now={now} />
          <Group heading="Kommende" interviews={interviews.filter((i) => !isToday(i) && new Date(i.startsAt) > now)} now={now} />
          <Group
            heading="Vorbei"
            interviews={interviews.filter((i) => !isToday(i) && new Date(i.startsAt) <= now).reverse()}
            now={now}
          />
        </>
      )}
    </main>
  );
}
