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
  validateApplication,
  type ApplicationFields,
  type FieldErrors,
} from "@/lib/application-form";
import { button, input } from "../ui";

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
  departments: { id: string; name: string; description: string }[];
  initial: ApplicationFields;
  replyTo: string;
  /** Shown above the submit button (public form). */
  privacyNotice?: string;
  /** "upload" when a CV was chosen; otherwise the form goes straight to submit (edit only). */
  prepare: (fields: ApplicationFields) => Promise<PrepareState>;
  /** ref: applicant id (new) or the uploaded path (edit), null = CV unchanged. */
  submit: (fields: ApplicationFields, ref: string | null) => Promise<SubmitState>;
  onCancel?: () => void;
  /** Edit only: called after saving, the page is refreshed. */
  onSaved?: () => void;
}

const hint = "text-sm text-zinc-600 dark:text-zinc-400";
const errorText = "text-sm text-red-700";
const box = "rounded border border-zinc-200 p-4 dark:border-zinc-800";

function Field({ label, error, note, children }: { label: string; error?: string; note?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      {note && <span className={hint}>{note}</span>}
      {children}
      {error && <span className={errorText}>{error}</span>}
    </label>
  );
}

function uploadClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function ApplicationForm({ mode, questions, departments, initial, replyTo, privacyNotice, prepare, submit, onCancel, onSaved }: Props) {
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
    setFields((f) => ({ ...f, departmentIds: ids, departmentUnsure: checked ? false : f.departmentUnsure }));
    setErrors((e) => ({ ...e, departments: "" }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const local = validateApplication(
      fields,
      { questionIds: questions.map((q) => q.id), departmentIds: departments.map((d) => d.id) },
      { requireDepartment: mode !== "admin", withEmail: mode !== "edit" },
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

  const departmentsDisabled = fields.departmentUnsure;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
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
          <input className={input} value={fields.cohort} onChange={(e) => set("cohort", e.target.value)} aria-invalid={!!errors.cohort || undefined} />
        </Field>
      </section>

      {questions.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Fragen</h2>
          {questions.map((q) => (
            <Field key={q.id} label={q.text} error={errors[`answers.${q.id}`]}>
              <textarea
                className={`${input} min-h-32`}
                value={fields.answers[q.id] ?? ""}
                onChange={(e) => set("answers", { ...fields.answers, [q.id]: e.target.value }, `answers.${q.id}`)}
                aria-invalid={!!errors[`answers.${q.id}`] || undefined}
              />
            </Field>
          ))}
        </section>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold">Wunsch-Ressort</legend>
        <p className={hint}>Du kannst mehrere wählen.{mode === "admin" && " Bei der Erfassung optional."}</p>
        {departments.map((d) => (
          <label key={d.id} className={`flex gap-3 ${departmentsDisabled ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0"
              checked={fields.departmentIds.includes(d.id)}
              disabled={departmentsDisabled}
              onChange={(e) => toggleDepartment(d.id, e.target.checked)}
            />
            <span>
              <span className="font-medium">{d.name}</span>
              {d.description && <span className={`block ${hint}`}>{d.description}</span>}
            </span>
          </label>
        ))}
        <label className="flex gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0"
            checked={fields.departmentUnsure}
            onChange={(e) => {
              setFields((f) => ({ ...f, departmentUnsure: e.target.checked, departmentIds: e.target.checked ? [] : f.departmentIds }));
              setErrors((er) => ({ ...er, departments: "" }));
            }}
          />
          <span className="font-medium">weiß ich noch nicht</span>
        </label>
        {errors.departments && <span className={errorText}>{errors.departments}</span>}
      </fieldset>

      <Field
        label={mode === "edit" ? "Neuer Lebenslauf (optional)" : "Lebenslauf"}
        note={mode === "edit" ? "Nur wählen, wenn du ihn ersetzen willst. PDF, höchstens 10 MB." : "PDF, höchstens 10 MB."}
        error={errors.cv}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="text-base"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErrors((er) => ({ ...er, cv: "" }));
          }}
          aria-invalid={!!errors.cv || undefined}
        />
      </Field>

      {privacyNotice && (
        <section className={box}>
          <h2 className="mb-2 font-semibold">Datenschutzhinweis</h2>
          <p className="whitespace-pre-line text-sm">{privacyNotice}</p>
        </section>
      )}

      {Object.values(errors).some(Boolean) && (
        <p className={errorText} role="alert">
          {errors.form || "Bitte prüfe die markierten Felder."}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button className={button} disabled={pending}>
          {pending ? "Wird gesendet …" : mode === "apply" ? "Bewerbung absenden" : mode === "admin" ? "Bewerbung erfassen" : "Änderungen speichern"}
        </button>
        {onCancel && (
          <button type="button" className="px-4 py-2" onClick={onCancel} disabled={pending}>
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
  const title = "mb-4 text-2xl font-semibold";
  const mailto = <a className="underline" href={`mailto:${replyTo}`}>{replyTo}</a>;

  if (result.status === "closed") {
    return (
      <div>
        <h1 className={title}>{mode === "edit" ? "Änderungen nicht mehr möglich" : "Bewerbungsphase beendet"}</h1>
        <p>
          {mode === "edit" ? "Die Bewerbungsphase ist vorbei, Änderungen sind nicht mehr möglich." : "Die Bewerbungsphase ist vorbei."} Bitte wende dich an {mailto}.
        </p>
      </div>
    );
  }

  if (result.status === "exists") {
    return (
      <div>
        <h1 className={title}>Bewerbung schon vorhanden</h1>
        <p className="mb-3">
          Für <strong>{email.trim()}</strong> gibt es bereits eine Bewerbung. Wir haben dir deinen persönlichen Link erneut an diese Adresse
          geschickt. Über ihn kannst du deine Bewerbung ansehen und ändern.
        </p>
        <p>Bitte schau auch im Junk- oder Spam-Ordner nach. Frühere Links gelten nicht mehr.</p>
      </div>
    );
  }

  if (result.status !== "done") return null;

  if (mode === "admin") {
    return (
      <div>
        <h1 className={title}>Bewerbung erfasst</h1>
        <p className="mb-4">
          {result.mailSent
            ? `Der persönliche Link ist an ${email.trim()} unterwegs.`
            : `Die Bewerbung ist gespeichert, aber die Mail mit dem Link an ${email.trim()} ging nicht raus. Über /bewerben mit derselben Adresse lässt sich ein neuer Link anfordern, solange die Bewerbungsphase läuft.`}
        </p>
        <button className={button} onClick={onReset}>
          Weitere Bewerbung erfassen
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className={title}>Danke für deine Bewerbung!</h1>
      {result.mailSent ? (
        <>
          <p className="mb-3">
            Deine Bewerbung ist bei uns eingegangen. Wir haben dir eine Bestätigung mit deinem persönlichen Link an <strong>{email.trim()}</strong>{" "}
            geschickt. Über den Link kannst du deine Bewerbung ansehen, bis zum Ende der Bewerbungsphase ändern und später deinen Gesprächstermin buchen.
          </p>
          <p className="mb-3 font-medium">Keine Mail bekommen? Bitte schau auch im Junk- oder Spam-Ordner nach.</p>
        </>
      ) : (
        <p className="mb-3">
          Deine Bewerbung ist gespeichert, aber die Bestätigungsmail konnte gerade nicht verschickt werden. Schick das Formular später einfach noch
          einmal mit derselben Mailadresse ab, dann bekommst du deinen Link, oder schreib an {mailto}.
        </p>
      )}
      <p>Fragen? Schreib an {mailto}.</p>
    </div>
  );
}
