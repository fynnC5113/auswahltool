"use client";

// Feedback form, variant A (Fynn 29.09.2026): every criterion on one page,
// score plus a required reason, then the overall text. Saves by itself while
// typing (draft); "Abgeben" submits. Laptop: a checklist with "Abgeben" in a
// column on the right. Phone: the same in a bar above the tab bar.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { missingParts, OVERALL, type Criterion, type FeedbackInput } from "@/lib/feedback-rules";
import {
  bottomBar,
  button,
  barButton,
  dialog as dialogClass,
  dialogBody,
  fieldError,
  fieldLabel,
  formGroup,
  input as inputClass,
  lead,
  listGroup,
  secondaryButton,
  section,
  sectionTitle,
} from "../../../../ui";
import { saveFeedbackAction } from "./actions";

type Save = { state: "idle" | "saving" | "saved" | "error"; message?: string };
const DELAY_MS = 800;

const stamp = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

function Scale({
  criterion,
  value,
  invalid,
  onPick,
}: {
  criterion: Criterion;
  value: number | null;
  invalid: boolean;
  onPick: (value: number) => void;
}) {
  const values = Array.from({ length: criterion.scaleMax - criterion.scaleMin + 1 }, (_, i) => criterion.scaleMin + i);
  const wide = values.length > 5;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label={`Punktzahl ${criterion.name}`}
        className={`grid max-w-[560px] grid-cols-5 gap-2 ${wide ? "lg:grid-cols-10" : ""}`}
      >
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onPick(v)}
            className="h-11 rounded-field bg-field text-body font-medium tabular-nums aria-pressed:bg-accent aria-pressed:text-on-accent"
          >
            {v}
          </button>
        ))}
      </div>
      <div className="flex max-w-[560px] justify-between text-small text-muted">
        <span>{criterion.scaleMin} = niedrig</span>
        <span>{criterion.scaleMax} = hoch</span>
      </div>
      {invalid && <p className={fieldError}>Bitte wähle eine Punktzahl.</p>}
    </div>
  );
}

export function FeedbackForm({
  applicantId,
  partner,
  criteria,
  initial,
  initialSubmittedAt,
}: {
  applicantId: string;
  partner: string;
  criteria: Criterion[];
  initial: FeedbackInput;
  initialSubmittedAt: string | null;
}) {
  const [input, setInput] = useState(initial);
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt);
  const [save, setSave] = useState<Save>({ state: "idle" });
  /** Parts marked as missing (after "Abgeben" or a refused save). */
  const [marked, setMarked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(input);
  const version = useRef(0);
  const done = useRef<HTMLDialogElement>(null);

  const missing = missingParts(criteria, input);
  const open = missing.length;

  async function persist(submit: boolean) {
    const mine = ++version.current;
    setSave({ state: "saving" });
    try {
      const result = await saveFeedbackAction(applicantId, latest.current, submit);
      if ("error" in result) {
        setSave({ state: "error", message: result.error });
        if (result.missing) setMarked(result.missing);
        return false;
      }
      if (mine === version.current) setSave({ state: "saved" });
      else return true;
      setSubmittedAt(result.submittedAt);
      return true;
    } catch {
      setSave({ state: "error", message: "Nicht gespeichert. Bitte prüfe deine Verbindung." });
      return false;
    }
  }

  function change(next: FeedbackInput) {
    setInput(next);
    latest.current = next;
    // Clear marks as soon as the part is filled in.
    setMarked((m) => m.filter((key) => missingParts(criteria, next).includes(key)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void persist(false);
    }, DELAY_MS);
  }

  // Save what is pending when leaving the page.
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void saveFeedbackAction(applicantId, latest.current, false);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [applicantId]);

  function setScore(criterionId: string, patch: { score?: number; text?: string }) {
    change({
      ...input,
      scores: input.scores.map((s) => (s.criterionId === criterionId ? { ...s, ...patch } : s)),
    });
  }

  async function submit() {
    if (open) {
      setMarked(missing);
      setSave({ state: "error", message: "Bitte fülle die markierten Felder aus." });
      document.getElementById(missing[0] === OVERALL ? "overall" : `reason-${missing[0]}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setSubmitting(true);
    const ok = await persist(true);
    setSubmitting(false);
    if (ok) done.current?.showModal();
  }

  const status =
    save.state === "saving"
      ? { text: "Speichert …", className: "text-muted" }
      : save.state === "error"
        ? { text: save.message ?? "Nicht gespeichert.", className: "text-danger" }
        : save.state === "saved"
          ? { text: submittedAt ? "✓ Änderungen gespeichert" : "✓ Entwurf gespeichert", className: "text-ok" }
          : null;
  const counter = open ? `Noch ${open} ${open === 1 ? "Angabe" : "Angaben"} offen` : "Alles ausgefüllt";
  const submittedText = submittedAt ? `Abgegeben am ${stamp.format(new Date(submittedAt))} Uhr` : null;
  const isMarked = (key: string) => marked.includes(key);

  return (
    <div className="grid gap-7 pb-24 sm:gap-9 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start lg:pb-0">
      <div className="flex flex-col gap-7 sm:gap-9">
        {criteria.map((c) => {
          const s = input.scores.find((x) => x.criterionId === c.id)!;
          const reasonInvalid = isMarked(c.id) && !s.text.trim();
          return (
            <section key={c.id} className={section}>
              <h2 className={sectionTitle}>{c.name}</h2>
              <div className={formGroup}>
                {c.description && <p className={lead}>{c.description}</p>}
                <Scale
                  criterion={c}
                  value={s.score}
                  invalid={isMarked(c.id) && s.score === null}
                  onPick={(score) => setScore(c.id, { score })}
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`reason-${c.id}`} className={fieldLabel}>
                    Begründung
                  </label>
                  <textarea
                    id={`reason-${c.id}`}
                    rows={2}
                    value={s.text}
                    aria-invalid={reasonInvalid}
                    placeholder="Warum diese Punktzahl?"
                    onChange={(e) => setScore(c.id, { text: e.target.value })}
                    className={`${inputClass} resize-y`}
                  />
                  {reasonInvalid && <p className={fieldError}>Bitte begründe deine Punktzahl.</p>}
                </div>
              </div>
            </section>
          );
        })}

        <section className={section}>
          <h2 className={sectionTitle}>Gesamteindruck</h2>
          <div className={formGroup}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="overall" className="sr-only">
                Gesamteindruck
              </label>
              <textarea
                id="overall"
                rows={4}
                value={input.overall}
                aria-invalid={isMarked(OVERALL) && !input.overall.trim()}
                placeholder="Was soll das Team bei der Auswahl wissen?"
                onChange={(e) => change({ ...input, overall: e.target.value })}
                className={`${inputClass} resize-y`}
              />
              {isMarked(OVERALL) && !input.overall.trim() && <p className={fieldError}>Bitte schreib deinen Gesamteindruck.</p>}
            </div>
          </div>
        </section>

        <p className="text-small text-muted">
          {submittedAt
            ? `Alle Mitglieder sehen dein Feedback. Änderungen werden automatisch gespeichert, bis das Board eingefroren ist.`
            : `Dein Entwurf ist nur für dich sichtbar. Nach der Abgabe sehen alle Mitglieder dein Feedback, und du siehst das von ${partner}.`}
        </p>
      </div>

      {/* Laptop: checklist and "Abgeben" on the right. */}
      <aside className="hidden flex-col gap-3 lg:sticky lg:top-24 lg:flex">
        <div className={listGroup}>
          {criteria.map((c) => {
            const s = input.scores.find((x) => x.criterionId === c.id)!;
            return (
              <Check key={c.id} done={!missing.includes(c.id)} label={c.name}>
                {s.score ?? "–"} / {c.scaleMax}
              </Check>
            );
          })}
          <Check done={!missing.includes(OVERALL)} label="Gesamteindruck" />
        </div>
        {status && <p className={`text-small font-medium ${status.className}`}>{status.text}</p>}
        {submittedText ? (
          <p className="text-note font-medium text-ok">{submittedText}</p>
        ) : (
          <>
            <button type="button" onClick={submit} disabled={submitting} className={`${button} lg:w-full ${open ? "opacity-50" : ""}`}>
              {submitting ? "Gibt ab …" : "Abgeben"}
            </button>
            <p className="text-small text-muted">{counter}</p>
          </>
        )}
      </aside>

      {/* Phone: bar above the tab bar. */}
      <div className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 lg:hidden ${bottomBar}`}>
        <div className="mx-auto flex max-w-[880px] items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            {status && <p className={`truncate text-small font-medium ${status.className}`}>{status.text}</p>}
            <p className="text-small text-muted">{submittedText ?? counter}</p>
          </div>
          {!submittedAt && (
            <button type="button" onClick={submit} disabled={submitting} className={`${barButton} ${open ? "opacity-50" : ""}`}>
              {submitting ? "Gibt ab …" : "Abgeben"}
            </button>
          )}
        </div>
      </div>

      <dialog ref={done} aria-label="Feedback abgegeben" className={dialogClass}>
        <div className={dialogBody}>
          <h2 className={sectionTitle}>Feedback abgegeben</h2>
          <p className={lead}>
            Alle Mitglieder sehen es jetzt. Das Feedback von {partner} siehst du auf der Bewerbung. Ändern kannst du deins, bis das
            Board eingefroren ist.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={`/bewerbungen/${applicantId}`} className={button}>
              Zur Bewerbung
            </Link>
            <Link href="/gespraeche" className={secondaryButton}>
              Zu Meine Gespräche
            </Link>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function Check({ done, label, children }: { done: boolean; label: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-[11px]">
      <span
        aria-hidden
        className={`grid size-[18px] shrink-0 place-items-center rounded-check text-small leading-none text-on-accent ${done ? "bg-ok" : "bg-field"}`}
      >
        {done ? "✓" : ""}
      </span>
      <span className="min-w-0 flex-1 text-note">
        {label}
        <span className="sr-only">{done ? ": ausgefüllt" : ": offen"}</span>
      </span>
      {children && <span className="text-small text-muted tabular-nums">{children}</span>}
    </div>
  );
}
