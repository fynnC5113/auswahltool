// Admin entry (PRD 4.3 "Ersatzweg"): also after the application phase.
import { emptyFields } from "@/lib/application-form";
import { loadApplicationRound } from "@/lib/application";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { ApplicationForm } from "../../../bewerben/application-form";
import { page } from "../../../ui";
import { prepareCapture, submitCapture } from "./actions";

export default async function CapturePage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={page}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  const round = await loadApplicationRound(supabase);

  return (
    <main className={page}>
      <h1 className="mb-2 text-2xl font-semibold">Bewerbung erfassen</h1>
      {round ? (
        <>
          <p className="mb-6 text-zinc-600 dark:text-zinc-400">
            Für Bewerbungen, die per Mail oder nach dem Ende der Bewerbungsphase kommen. Die Person bekommt ihren persönlichen Link per Mail.
            Pflicht sind Name, Mail, Jahrgang, Antworten und Lebenslauf; das Ressort ist optional.
          </p>
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
        <p>Es gibt noch keine Runde. Bitte lege sie zuerst unter „Runde“ an.</p>
      )}
    </main>
  );
}
