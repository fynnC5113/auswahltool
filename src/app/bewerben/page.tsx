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
import { link, page } from "../ui";
import { prepareApply, submitApply } from "./actions";
import { ApplicationForm } from "./application-form";

export const metadata: Metadata = { title: "Bewerbung Orga-Team der Law Clinic" };

export default async function ApplyPage() {
  // Depends on the time of the request: never prerender.
  await connection();
  const round = await loadApplicationRound(createAdminClient());
  const replyTo = round?.replyTo ?? DEFAULT_REPLY_TO;
  const state = round ? applicationWindow(round.opensAt, round.closesAt, new Date()) : "closed";
  const mailto = <a className={link} href={`mailto:${replyTo}`}>{replyTo}</a>;

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
      </main>
    );
  }

  return (
    <main className={page}>
      <Brand />
      <PageHeader heading="Bewerbung für das Orga-Team der Law Clinic">
        Bewerbungsschluss: {formatBerlin(round.closesAt)}. Alle Felder sind Pflicht.
      </PageHeader>
      <ApplicationForm
        mode="apply"
        questions={round.questions}
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
