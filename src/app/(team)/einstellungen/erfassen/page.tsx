// Admin entry (PRD 4.3 "Ersatzweg"): also after the application phase.
import { emptyFields } from "@/lib/application-form";
import { loadApplicationRound } from "@/lib/application";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { ApplicationForm } from "../../../bewerben/application-form";
import { PageHeader } from "../../../brand";
import { teamPage } from "../../../ui";
import { prepareCapture, submitCapture } from "./actions";

export default async function CapturePage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={teamPage}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  const round = await loadApplicationRound(supabase);

  return (
    <main className={teamPage}>
      {round ? (
        <>
          <PageHeader heading="Bewerbung erfassen">
            Für Bewerbungen, die per Mail oder nach dem Ende der Bewerbungsphase kommen. Die Person bekommt ihren persönlichen Link per Mail.
            Pflicht sind Name, Mail, Jahrgang, Antworten und Lebenslauf; das Ressort ist optional.
          </PageHeader>
          <ApplicationForm
            mode="admin"
            questions={round.questions}
            departments={round.departments}
            initial={emptyFields()}
            replyTo={round.replyTo}
            prepare={prepareCapture}
            submit={submitCapture}
          />
        </>
      ) : (
        <PageHeader heading="Bewerbung erfassen">Es gibt noch keine Runde. Bitte lege sie zuerst unter „Runde“ an.</PageHeader>
      )}
    </main>
  );
}
