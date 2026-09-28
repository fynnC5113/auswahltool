"use client";

import { useState } from "react";
import type { ApplicationFields } from "@/lib/application-form";
import { ApplicationForm, type PrepareState, type SubmitState } from "../../bewerben/application-form";
import { button, secondaryButton } from "../../ui";

interface Props {
  applicant: Omit<ApplicationFields, "email"> & { email: string; hasCv: boolean };
  questions: { id: string; text: string }[];
  departments: { id: string; name: string; description: string }[];
  editable: boolean;
  /** Formatted end of the application phase. */
  deadline: string;
  replyTo: string;
  cvHref: string;
  prepare: (fields: ApplicationFields) => Promise<PrepareState>;
  save: (fields: ApplicationFields, newCvPath: string | null) => Promise<SubmitState>;
  withdraw: () => Promise<boolean>;
}

const label = "text-sm text-zinc-600 dark:text-zinc-400";
const box = "rounded border border-zinc-200 p-4 dark:border-zinc-800";

export function ApplicantView(props: Props) {
  const { applicant, questions, departments, editable, deadline, replyTo, cvHref } = props;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [error, setError] = useState("");
  const mailto = <a className="underline" href={`mailto:${replyTo}`}>{replyTo}</a>;

  if (withdrawn) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">Bewerbung zurückgezogen</h1>
        <p>Deine Bewerbung und dein Lebenslauf sind endgültig gelöscht. Dieser Link funktioniert nicht mehr.</p>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Bewerbung ändern</h1>
        <ApplicationForm
          mode="edit"
          questions={questions}
          departments={departments}
          initial={applicant}
          replyTo={replyTo}
          prepare={props.prepare}
          submit={props.save}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
          }}
        />
      </div>
    );
  }

  async function onWithdraw() {
    setWithdrawing(true);
    setError("");
    try {
      if (await props.withdraw()) setWithdrawn(true);
      else setError("Die Bewerbung wurde nicht gefunden. Vielleicht ist sie schon gelöscht.");
    } catch (e) {
      console.error(e);
      setError(`Das Zurückziehen hat nicht geklappt. Bitte versuche es noch einmal oder schreib an ${replyTo}.`);
    } finally {
      setWithdrawing(false);
    }
  }

  const chosen = departments.filter((d) => applicant.departmentIds.includes(d.id)).map((d) => d.name);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-2 text-2xl font-semibold">Deine Bewerbung</h1>
        {saved && <p className="mb-2 font-medium text-green-700" role="status">Änderungen gespeichert.</p>}
        <p className={label}>
          {editable
            ? `Du kannst deine Bewerbung bis zum ${deadline} ändern.`
            : "Die Bewerbungsphase ist vorbei, Änderungen sind nicht mehr möglich."}{" "}
          Die Buchung deines Gesprächstermins folgt hier nach dem Ende der Bewerbungsphase.
        </p>
      </div>

      <dl className="flex flex-col gap-3">
        <div>
          <dt className={label}>Name</dt>
          <dd>{applicant.name}</dd>
        </div>
        <div>
          <dt className={label}>Mailadresse</dt>
          <dd className="break-all">{applicant.email}</dd>
        </div>
        <div>
          <dt className={label}>Jahrgang</dt>
          <dd>{applicant.cohort}</dd>
        </div>
        {questions.map((q) => (
          <div key={q.id}>
            <dt className={label}>{q.text}</dt>
            <dd className="whitespace-pre-line">{applicant.answers[q.id] ?? ""}</dd>
          </div>
        ))}
        <div>
          <dt className={label}>Wunsch-Ressort</dt>
          <dd>{applicant.departmentUnsure ? "weiß ich noch nicht" : chosen.join(", ") || "–"}</dd>
        </div>
        <div>
          <dt className={label}>Lebenslauf</dt>
          <dd>
            {applicant.hasCv ? (
              <a className="underline" href={cvHref} target="_blank" rel="noreferrer">
                PDF ansehen
              </a>
            ) : (
              "–"
            )}
          </dd>
        </div>
      </dl>

      {editable && (
        <div>
          <button className={button} onClick={() => { setSaved(false); setEditing(true); }}>
            Bewerbung ändern
          </button>
        </div>
      )}
      {!editable && <p>Wenn du noch etwas ändern musst, schreib bitte an {mailto}.</p>}

      <section className={box}>
        <h2 className="mb-2 font-semibold">Bewerbung zurückziehen</h2>
        {!confirming ? (
          <>
            <p className="mb-3 text-sm">Deine Bewerbung und dein Lebenslauf werden sofort und endgültig gelöscht.</p>
            <button className={secondaryButton} onClick={() => setConfirming(true)}>
              Bewerbung zurückziehen
            </button>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm font-medium">Wirklich zurückziehen? Das lässt sich nicht rückgängig machen.</p>
            <div className="flex flex-wrap gap-3">
              <button className="rounded bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={onWithdraw} disabled={withdrawing}>
                {withdrawing ? "Wird gelöscht …" : "Ja, endgültig zurückziehen"}
              </button>
              <button className={secondaryButton} onClick={() => setConfirming(false)} disabled={withdrawing}>
                Abbrechen
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      </section>
    </div>
  );
}
