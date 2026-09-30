// Public application form (PRD 4.3). Open only during the application phase
// of the newest round.
import type { Metadata } from "next";
import { connection } from "next/server";
import { applicationWindow, emptyFields } from "@/lib/application-form";
import { loadApplicationRound } from "@/lib/application";
import { formatBerlin } from "@/lib/mail/templates";
import { DEFAULT_REPLY_TO } from "@/lib/round-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { Brand, PageHeader } from "../brand";
import { link, page, section, sectionTitle } from "../ui";
import { prepareApply, submitApply } from "./actions";
import { ApplicationForm } from "./application-form";
import { FirstRunNotice } from "./first-run-notice";

export const metadata: Metadata = { title: "Bewerbung Orga-Team der Law Clinic" };

export default async function ApplyPage() {
  // Depends on the time of the request: never prerender.
  await connection();
  const round = await loadApplicationRound(createAdminClient());
  const replyTo = round?.replyTo ?? DEFAULT_REPLY_TO;
  const state = round ? applicationWindow(round.opensAt, round.closesAt, new Date()) : "closed";
  const mailto = <a className={link} href={`mailto:${replyTo}`}>{replyTo}</a>;
  const privacyNotice = round?.privacyNotice.trim() ?? "";

  if (!round || state !== "open") {
    return (
      <main className={page}>
        <Brand />
        <PageHeader heading="Bewerbung für das Orga-Team der Law Clinic" />
        <p>
          {round && state === "before"
            ? `Die Bewerbungsphase beginnt am ${formatBerlin(round.opensAt)}. `
            : "Das Bewerbungsformular ist geschlossen. "}
          Bei Fragen wende dich bitte an {mailto}.
        </p>
        {round && state === "before" && (
          <>
            <FirstRunNotice replyTo={replyTo} hasPrivacyNotice={privacyNotice !== ""} />
            {privacyNotice && (
              <section className={section}>
                <h2 className={sectionTitle}>Datenschutz</h2>
                <details id="datenschutz" className="group scroll-mt-4 rounded-group bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-[11px] font-medium [&::-webkit-details-marker]:hidden">
                    Datenschutzhinweis lesen
                    <span aria-hidden className="mr-1 size-2 rotate-45 border-r-2 border-b-2 border-muted transition-transform group-open:-rotate-135" />
                  </summary>
                  <p className="px-4 pb-4 text-note whitespace-pre-line text-muted">{privacyNotice}</p>
                </details>
              </section>
            )}
          </>
        )}
      </main>
    );
  }

  return (
    <main className={page}>
      <Brand />
      <PageHeader heading="Bewerbung für das Orga-Team der Law Clinic">
        Bewerbungsschluss: {formatBerlin(round.closesAt)}.
      </PageHeader>
      <FirstRunNotice replyTo={replyTo} hasPrivacyNotice={privacyNotice !== ""} />
      <ApplicationForm
        mode="apply"
        questions={round.questions}
        requiredAnswers={round.requiredAnswers}
        departments={round.departments}
        initial={emptyFields()}
        replyTo={replyTo}
        privacyNotice={round.privacyNotice}
        prepare={prepareApply}
        submit={submitApply}
      />
    </main>
  );
}
