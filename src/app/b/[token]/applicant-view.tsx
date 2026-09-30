"use client";

import { useState, type ReactNode } from "react";
import type { ApplicationFields } from "@/lib/application-form";
import { ApplicationForm, type PrepareState, type SubmitState } from "../../bewerben/application-form";
import { PageHeader } from "../../brand";
import {
  alertBox,
  dangerButton,
  dangerTextButton,
  lead,
  link,
  listGroup,
  listRow,
  okText,
  readLabel,
  secondaryButton,
  section,
  sectionTitle,
} from "../../ui";

interface Props {
  applicant: Omit<ApplicationFields, "email"> & { email: string; hasCv: boolean };
  questions: { id: string; text: string }[];
  requiredAnswers: number | null;
  departments: { id: string; name: string; description: string }[];
  editable: boolean;
  /** Formatted end of the application phase. */
  deadline: string;
  replyTo: string;
  cvHref: string;
  prepare: (fields: ApplicationFields) => Promise<PrepareState>;
  save: (fields: ApplicationFields, newCvPath: string | null) => Promise<SubmitState>;
  withdraw: () => Promise<boolean>;
  /** "Dein Gesprächstermin" (booking-section.tsx). */
  booking: ReactNode;
}

export function ApplicantView(props: Props) {
  const { applicant, questions, requiredAnswers, departments, editable, deadline, replyTo, cvHref } = props;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState("");
  const mailto = <a className={link} href={`mailto:${replyTo}`}>{replyTo}</a>;

  if (editing) {
    return (
      <>
        <PageHeader heading="Bewerbung ändern" />
        <ApplicationForm
          mode="edit"
          questions={questions}
          requiredAnswers={requiredAnswers}
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
      </>
    );
  }

  async function onWithdraw() {
    setWithdrawing(true);
    setError("");
    try {
      // On success the server redirects to /b/zurueckgezogen.
      if ((await props.withdraw()) === false) setError("Die Bewerbung wurde nicht gefunden. Vielleicht ist sie schon gelöscht.");
    } catch (e) {
      console.error(e);
      setError(`Das Zurückziehen hat nicht geklappt. Bitte versuche es noch einmal oder schreib an ${replyTo}.`);
    } finally {
      setWithdrawing(false);
    }
  }

  const chosen = departments.filter((d) => applicant.departmentIds.includes(d.id)).map((d) => d.name);

  return (
    <>
      <PageHeader heading="Deine Bewerbung">
        Hallo {applicant.name.split(" ")[0]}, hier buchst du deinen Gesprächstermin und siehst deine Angaben.
      </PageHeader>

      {props.booking}

      <section className={section}>
        <h2 className={sectionTitle}>Deine Angaben</h2>
        {saved && (
          <p className={okText} role="status">
            Änderungen gespeichert.
          </p>
        )}
        <p className={lead}>
          {editable
            ? `Du kannst deine Bewerbung bis zum ${deadline} ändern.`
            : "Die Bewerbungsphase ist vorbei, Änderungen sind nicht mehr möglich."}
        </p>

        <dl className={listGroup}>
          <div className={listRow}>
            <dt className={readLabel}>Name</dt>
            <dd>{applicant.name}</dd>
          </div>
          <div className={listRow}>
            <dt className={readLabel}>Mailadresse</dt>
            <dd className="break-all">{applicant.email}</dd>
          </div>
          <div className={listRow}>
            <dt className={readLabel}>Jahrgang</dt>
            <dd>{applicant.cohort}</dd>
          </div>
          {questions.map((q) => (
            <div key={q.id} className={listRow}>
              <dt className={readLabel}>{q.text}</dt>
              <dd className="whitespace-pre-line">{applicant.answers[q.id] ?? "–"}</dd>
            </div>
          ))}
          <div className={listRow}>
            <dt className={readLabel}>Wunsch-Ressort</dt>
            <dd>
              {applicant.departmentAll ? "für alle Ressorts offen" : chosen.join(", ") || "–"}
            </dd>
          </div>
          <div className={listRow}>
            <dt className={readLabel}>Lebenslauf</dt>
            <dd>
              {applicant.hasCv ? (
                <a className={link} href={cvHref} target="_blank" rel="noreferrer">
                  PDF ansehen
                </a>
              ) : (
                "–"
              )}
            </dd>
          </div>
        </dl>

        {editable && (
          <div className="pt-2">
            <button className={secondaryButton} onClick={() => { setSaved(false); setEditing(true); }}>
              Bewerbung ändern
            </button>
          </div>
        )}
        {!editable && <p className={lead}>Wenn du noch etwas ändern musst, schreib bitte an {mailto}.</p>}
      </section>

      <section className={section}>
        <h2 className={sectionTitle}>Bewerbung zurückziehen</h2>
        {!confirming ? (
          <>
            <p className={lead}>Deine Bewerbung und dein Lebenslauf werden sofort und endgültig gelöscht.</p>
            <div className="pt-1">
              <button className={dangerTextButton} onClick={() => setConfirming(true)}>
                Bewerbung zurückziehen
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-group bg-surface p-4">
            <p className="font-medium">Wirklich zurückziehen? Das lässt sich nicht rückgängig machen.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button className={dangerButton} onClick={onWithdraw} disabled={withdrawing}>
                {withdrawing ? "Wird gelöscht …" : "Ja, endgültig zurückziehen"}
              </button>
              <button className={secondaryButton} onClick={() => setConfirming(false)} disabled={withdrawing}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className={alertBox} role="alert">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
