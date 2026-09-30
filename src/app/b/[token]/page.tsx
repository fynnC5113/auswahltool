// Personal applicant page (PRD 4.3): view, edit until the deadline, withdraw.
// No account: the token in the URL is checked on the server on every request.
import type { Metadata } from "next";
import { canEdit, findApplicant, loadApplicationRound } from "@/lib/application";
import { formatBerlin } from "@/lib/mail/templates";
import { DEFAULT_REPLY_TO } from "@/lib/round-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { Brand, PageHeader } from "../../brand";
import { link, page } from "../../ui";
import { loadBooking } from "@/lib/booking";
import { book, prepareEdit, saveEdit, withdraw } from "./actions";
import { ApplicantView } from "./applicant-view";
import { BookingSection } from "./booking-section";

// no-referrer: the token must not leak to other sites through links.
export const metadata: Metadata = { title: "Deine Bewerbung", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function ApplicantPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const applicant = await findApplicant(db, token);

  if (!applicant) {
    // Neutral: does not reveal whether an application existed (PRD 7).
    const replyTo = (await loadApplicationRound(db))?.replyTo ?? DEFAULT_REPLY_TO;
    return (
      <main className={page}>
        <Brand />
        <PageHeader heading="Link ungültig" />
        <p>
          Dieser Link ist ungültig oder nicht mehr gültig. Wenn du Fragen zu deiner Bewerbung hast, wende dich bitte an{" "}
          <a className={link} href={`mailto:${replyTo}`}>{replyTo}</a>.
        </p>
      </main>
    );
  }

  const { round } = applicant;
  const booking = await loadBooking(db, applicant);
  return (
    <main className={page}>
      <Brand />
      <ApplicantView
        applicant={{
          name: applicant.name,
          email: applicant.email,
          cohort: applicant.cohort,
          answers: applicant.answers,
          departmentIds: applicant.departmentIds,
          departmentUnsure: applicant.departmentUnsure,
          departmentAll: applicant.departmentAll,
          privacyConfirmed: false,
          hasCv: !!applicant.cvPath,
        }}
        questions={round.questions}
        requiredAnswers={round.requiredAnswers}
        departments={round.departments}
        editable={canEdit(applicant)}
        deadline={formatBerlin(round.closesAt)}
        replyTo={round.replyTo}
        cvHref={`/b/${token}/lebenslauf`}
        prepare={prepareEdit.bind(null, token)}
        save={saveEdit.bind(null, token)}
        withdraw={withdraw.bind(null, token)}
        booking={
          <BookingSection
            booked={booking.booked}
            rebookUntil={booking.rebookUntil && formatBerlin(booking.rebookUntil)}
            canRebook={booking.canRebook}
            offers={booking.offers}
            planned={booking.planned}
            interviewMinutes={booking.interviewMinutes}
            rebookHoursBefore={booking.rebookHoursBefore}
            replyTo={round.replyTo}
            book={book.bind(null, token)}
          />
        }
      />
    </main>
  );
}
