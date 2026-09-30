"use client";

// One form for the public application (/bewerben), the admin entry
// (/einstellungen/erfassen) and editing on the applicant page (/b/[token]).
// The CV goes from the browser straight to Storage with a signed upload URL,
// because Vercel functions accept at most 4.5 MB per request.
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  cvFileError,
  requiredAnswersNote,
  validateApplication,
  type ApplicationFields,
  type FieldErrors,
} from "@/lib/application-form";
import {
  alertBox,
  button,
  checkRow,
  fieldError,
  fieldLabel,
  formGroup,
  input,
  lead,
  link,
  listGroup,
  noticeBox,
  secondaryButton,
  section,
  sectionTitle,
} from "../ui";

export type PrepareState =
  | { status: "closed" }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "exists" }
  | { status: "upload"; ref: string; path: string; token: string };

export type SubmitState =
  | { status: "closed" }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "exists" }
  | { status: "done"; mailSent: boolean };

export type Mode = "apply" | "admin" | "edit";

interface Props {
  mode: Mode;
  questions: { id: string; text: string }[];
  /** How many questions must be answered; null = all. */
  requiredAnswers: number | null;
  departments: { id: string; name: string; description: string }[];
  initial: ApplicationFields;
  replyTo: string;
  /** Public form: collapsible notice plus a required checkbox above the submit button. */
  privacyNotice?: string;
  /** "upload" when a CV was chosen; otherwise the form goes straight to submit (edit only). */
  prepare: (fields: ApplicationFields) => Promise<PrepareState>;
  /** ref: applicant id (new) or the uploaded path (edit), null = CV unchanged. */
  submit: (fields: ApplicationFields, ref: string | null) => Promise<SubmitState>;
  onCancel?: () => void;
  /** Edit only: called after saving, the page is refreshed. */
  onSaved?: () => void;
}

const hint = "text-small text-muted";

function Field({ label, error, note, children }: { label: string; error?: string; note?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={fieldLabel}>
        {label}
        {note && <span className={`block font-normal ${hint}`}>{note}</span>}
      </span>
      {children}
      {error && <span className={fieldError}>{error}</span>}
    </label>
  );
}

function uploadClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function ApplicationForm({ mode, questions, requiredAnswers, departments, initial, replyTo, privacyNotice, prepare, submit, onCancel, onSaved }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitState | null>(null);
  const cvRequired = mode !== "edit";

  function set<K extends keyof ApplicationFields>(key: K, value: ApplicationFields[K], errorKey: string = key) {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[errorKey];
      delete rest.form;
      return rest;
    });
  }

  function toggleDepartment(id: string, checked: boolean) {
    const ids = checked ? [...fields.departmentIds, id] : fields.departmentIds.filter((d) => d !== id);
    setFields((f) => ({ ...f, departmentIds: ids }));
    setErrors((e) => ({ ...e, departments: "" }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const local = validateApplication(
      fields,
      { questionIds: questions.map((q) => q.id), departmentIds: departments.map((d) => d.id), requiredAnswers },
      { requireDepartment: mode !== "admin", withEmail: mode !== "edit", requirePrivacy: mode === "apply" && !!privacyNotice?.trim() },
    );
    if (cvRequired || file) {
      const cv = cvFileError(file);
      if (cv) local.cv = cv;
    }
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    setPending(true);
    setErrors({});
    try {
      let ref: string | null = null;
      if (cvRequired || file) {
        const prepared = await prepare(fields);
        if (prepared.status !== "upload") {
          finish(prepared);
          return;
        }
        // The bucket only takes application/pdf; some phones leave the type empty.
        const body = new Blob([file!], { type: "application/pdf" });
        const { error } = await uploadClient().storage.from("cv").uploadToSignedUrl(prepared.path, prepared.token, body, {
          contentType: "application/pdf",
        });
        if (error) {
          setErrors({ cv: "Der Lebenslauf konnte nicht hochgeladen werden. Bitte versuche es noch einmal." });
          return;
        }
        ref = prepared.ref;
      }
      finish(await submit(fields, ref));
    } catch (e) {
      console.error(e);
      setErrors({ form: `Etwas ist schiefgegangen. Bitte versuche es noch einmal oder schreib an ${replyTo}.` });
    } finally {
      setPending(false);
    }
  }

  function finish(state: SubmitState | PrepareState) {
    if (state.status === "invalid") {
      setErrors(state.errors);
      return;
    }
    if (state.status === "upload") return;
    if (mode === "edit" && state.status === "done") {
      router.refresh();
      onSaved?.();
      return;
    }
    setResult(state);
    window.scrollTo({ top: 0 });
  }

  function reset() {
    setFields(initial);
    setFile(null);
    setErrors({});
    setResult(null);
  }

  if (result) return <Result mode={mode} result={result} email={fields.email} replyTo={replyTo} onReset={reset} />;

  const departmentsDisabled = fields.departmentUnsure || fields.departmentAll;
  const answersNote = requiredAnswersNote(questions.length, requiredAnswers);

  /** "alle Ressorts" and "weiß ich noch nicht" exclude each other and the single departments. */
  function setDepartmentChoice(choice: "departmentAll" | "departmentUnsure", checked: boolean) {
    setFields((f) => ({
      ...f,
      departmentAll: choice === "departmentAll" && checked,
      departmentUnsure: choice === "departmentUnsure" && checked,
      departmentIds: checked ? [] : f.departmentIds,
    }));
    setErrors((er) => ({ ...er, departments: "" }));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-7 sm:gap-9">
      <section className={section}>
        <h2 className={sectionTitle}>{mode === "admin" ? "Angaben" : "Über dich"}</h2>
        <div className={`${formGroup} sm:grid sm:grid-cols-2 sm:items-end`}>
          <Field label="Name" error={errors.name}>
            <input className={input} value={fields.name} autoComplete="name" onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name || undefined} />
          </Field>
          {mode !== "edit" && (
            <Field label="Mailadresse" error={errors.email} note={mode === "apply" ? "An diese Adresse schicken wir deinen persönlichen Link." : undefined}>
              <input
                className={input}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={fields.email}
                onChange={(e) => set("email", e.target.value)}
                aria-invalid={!!errors.email || undefined}
              />
            </Field>
          )}
          <Field label="Jahrgang" error={errors.cohort} note="Zum Beispiel 2024">
            <input className={input} inputMode="numeric" value={fields.cohort} onChange={(e) => set("cohort", e.target.value)} aria-invalid={!!errors.cohort || undefined} />
          </Field>
        </div>
      </section>

      {questions.length > 0 && (
        <section className={section}>
          <h2 className={sectionTitle}>{mode === "admin" ? "Antworten" : "Deine Antworten"}</h2>
          {answersNote && <p className={lead}>{answersNote}</p>}
          <div className={formGroup}>
            {questions.map((q) => (
              <Field key={q.id} label={q.text} error={errors[`answers.${q.id}`]}>
                <textarea
                  className={`${input} min-h-32 resize-y`}
                  value={fields.answers[q.id] ?? ""}
                  onChange={(e) => {
                    set("answers", { ...fields.answers, [q.id]: e.target.value }, `answers.${q.id}`);
                    setErrors((er) => ({ ...er, answers: "" }));
                  }}
                  aria-invalid={!!errors[`answers.${q.id}`] || undefined}
                />
              </Field>
            ))}
          </div>
          {errors.answers && <span className={fieldError}>{errors.answers}</span>}
        </section>
      )}

      <fieldset className={section}>
        <legend className={`${sectionTitle} mb-2`}>Wunsch-Ressort</legend>
        <p className={lead}>Du kannst mehrere wählen.{mode === "admin" && " Bei der Erfassung optional."}</p>
        <div className={listGroup}>
          <label className={`${checkRow} ${fields.departmentUnsure ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              className="check"
              checked={fields.departmentAll}
              disabled={fields.departmentUnsure}
              onChange={(e) => setDepartmentChoice("departmentAll", e.target.checked)}
            />
            <span>Ich bin für alle Ressorts offen</span>
          </label>
          {departments.map((d) => (
            <label key={d.id} className={`${checkRow} ${departmentsDisabled ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                className="check"
                checked={fields.departmentIds.includes(d.id)}
                disabled={departmentsDisabled}
                onChange={(e) => toggleDepartment(d.id, e.target.checked)}
              />
              <span>
                {d.name}
                {d.description && <span className={`block ${hint}`}>{d.description}</span>}
              </span>
            </label>
          ))}
          <label className={`${checkRow} ${fields.departmentAll ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              className="check"
              checked={fields.departmentUnsure}
              disabled={fields.departmentAll}
              onChange={(e) => setDepartmentChoice("departmentUnsure", e.target.checked)}
            />
            <span>weiß ich noch nicht</span>
          </label>
        </div>
        {errors.departments && <span className={fieldError}>{errors.departments}</span>}
      </fieldset>

      <section className={section}>
        <h2 className={sectionTitle}>{mode === "edit" ? "Neuer Lebenslauf" : "Lebenslauf"}</h2>
        <div className={formGroup}>
          <Field
            label={mode === "edit" ? "PDF-Datei (optional)" : "PDF-Datei"}
            note={mode === "edit" ? "Nur wählen, wenn du ihn ersetzen willst. Höchstens 10 MB." : "Höchstens 10 MB."}
            error={errors.cv}
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="w-full text-note text-muted file:mr-3 file:h-11 file:cursor-pointer file:rounded-button file:border-0 file:bg-field file:px-4 file:text-note file:font-medium file:text-accent"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setErrors((er) => ({ ...er, cv: "" }));
              }}
              aria-invalid={!!errors.cv || undefined}
            />
          </Field>
        </div>
      </section>

      {mode === "apply" && privacyNotice?.trim() && (
        <section className={section}>
          <h2 className={sectionTitle}>Datenschutz</h2>
          <details id="datenschutz" className="group scroll-mt-4 rounded-group bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-[11px] font-medium [&::-webkit-details-marker]:hidden">
              Datenschutzhinweis lesen
              <span aria-hidden className="mr-1 size-2 rotate-45 border-r-2 border-b-2 border-muted transition-transform group-open:-rotate-135" />
            </summary>
            <p className="px-4 pb-4 text-note whitespace-pre-line text-muted">{privacyNotice}</p>
          </details>
          <div className={listGroup}>
            <label className={checkRow}>
              <input
                type="checkbox"
                className="check"
                checked={fields.privacyConfirmed}
                onChange={(e) => set("privacyConfirmed", e.target.checked, "privacy")}
                aria-invalid={!!errors.privacy || undefined}
              />
              <span>Ich habe den Datenschutzhinweis zur Kenntnis genommen.</span>
            </label>
          </div>
          {errors.privacy && <span className={fieldError}>{errors.privacy}</span>}
        </section>
      )}

      {Object.values(errors).some(Boolean) && (
        <p className={alertBox} role="alert">
          {errors.form || "Bitte prüfe die markierten Felder."}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button className={button} disabled={pending}>
          {pending ? "Wird gesendet …" : mode === "apply" ? "Bewerbung absenden" : mode === "admin" ? "Bewerbung erfassen" : "Änderungen speichern"}
        </button>
        {onCancel && (
          <button type="button" className={secondaryButton} onClick={onCancel} disabled={pending}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}

function Result({ mode, result, email, replyTo, onReset }: {
  mode: Mode;
  result: SubmitState;
  email: string;
  replyTo: string;
  onReset: () => void;
}) {
  const box = "flex flex-col gap-3 rounded-group bg-surface p-4";
  const mailto = <a className={link} href={`mailto:${replyTo}`}>{replyTo}</a>;

  if (result.status === "closed") {
    return (
      <section className={box}>
        <h2 className={sectionTitle}>{mode === "edit" ? "Änderungen nicht mehr möglich" : "Bewerbungsphase beendet"}</h2>
        <p>
          {mode === "edit" ? "Die Bewerbungsphase ist vorbei, Änderungen sind nicht mehr möglich." : "Die Bewerbungsphase ist vorbei."} Bitte wende dich an {mailto}.
        </p>
      </section>
    );
  }

  if (result.status === "exists") {
    return (
      <section className={box}>
        <h2 className={sectionTitle}>Bewerbung schon vorhanden</h2>
        <p>
          Für <strong className="font-semibold">{email.trim()}</strong> gibt es bereits eine Bewerbung. Wir haben dir deinen persönlichen Link erneut an
          diese Adresse geschickt. Über ihn kannst du deine Bewerbung ansehen und ändern.
        </p>
        <p className={lead}>Bitte schau auch im Junk- oder Spam-Ordner nach. Frühere Links gelten nicht mehr.</p>
      </section>
    );
  }

  if (result.status !== "done") return null;

  if (mode === "admin") {
    return (
      <section className={box}>
        <h2 className={sectionTitle}>Bewerbung erfasst</h2>
        <p>
          {result.mailSent
            ? `Der persönliche Link ist an ${email.trim()} unterwegs.`
            : `Die Bewerbung ist gespeichert, aber die Mail mit dem Link an ${email.trim()} ging nicht raus. Über /bewerben mit derselben Adresse lässt sich ein neuer Link anfordern, solange die Bewerbungsphase läuft.`}
        </p>
        <div>
          <button className={button} onClick={onReset}>
            Weitere Bewerbung erfassen
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={box}>
      <h2 className={sectionTitle}>Danke für deine Bewerbung!</h2>
      {result.mailSent ? (
        <>
          <p>
            Deine Bewerbung ist bei uns eingegangen. Wir haben dir eine Bestätigung mit deinem persönlichen Link an{" "}
            <strong className="font-semibold">{email.trim()}</strong> geschickt. Über den Link kannst du deine Bewerbung ansehen, bis zum Ende der
            Bewerbungsphase ändern und später deinen Gesprächstermin buchen.
          </p>
          <p className={noticeBox}>Keine Mail bekommen? Bitte schau auch im Junk- oder Spam-Ordner nach.</p>
        </>
      ) : (
        <p>
          Deine Bewerbung ist gespeichert, aber die Bestätigungsmail konnte gerade nicht verschickt werden. Schick das Formular später einfach noch
          einmal mit derselben Mailadresse ab, dann bekommst du deinen Link, oder schreib an {mailto}.
        </p>
      )}
      <p className={lead}>Fragen? Schreib an {mailto}.</p>
    </section>
  );
}
