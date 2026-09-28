"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { newCriterion, type FieldErrors, type RoundForm } from "@/lib/round-form";
import { button, input, secondaryButton } from "../../../ui";
import { saveRoundAction } from "./actions";

type ListName = "questions" | "departments" | "criteria";
type Item = { key: string; id: string | null };
type TextField = Exclude<keyof RoundForm, "id" | ListName>;

const LISTS: ListName[] = ["questions", "departments", "criteria"];

const IN_USE: Record<ListName, string> = {
  questions: "hat schon Antworten",
  departments: "wurde schon gewählt",
  criteria: "hat schon Bewertungen",
};

const hint = "text-sm text-zinc-600 dark:text-zinc-400";
const errorText = "text-sm text-red-700";

function itemLabel(item: Item): string {
  return "text" in item ? String(item.text) : String((item as Item & { name: string }).name);
}

function moved<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Field({ label, error, note, children }: { label: string; error?: string; note?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      {children}
      {note && <span className={hint}>{note}</span>}
      {error && <span className={errorText}>{error}</span>}
    </label>
  );
}

function ItemControls({ index, count, onMove, onRemove }: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button type="button" className={secondaryButton} disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Nach oben">
        ↑
      </button>
      <button type="button" className={secondaryButton} disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="Nach unten">
        ↓
      </button>
      <button type="button" className={secondaryButton} onClick={onRemove}>
        Entfernen
      </button>
    </div>
  );
}

export function RoundEditor({ initial }: { initial: RoundForm }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [kept, setKept] = useState<Partial<Record<ListName, string[]>>>({});
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  // A field's error goes as soon as the field is changed.
  function clearError(key: string) {
    setErrors((e) => {
      if (!(key in e)) return e;
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
  }

  function text(field: TextField) {
    return {
      value: form[field],
      onChange: (e: { target: { value: string } }) => {
        setForm((f) => ({ ...f, [field]: e.target.value }));
        clearError(field);
      },
      className: input,
      "aria-invalid": !!errors[field] || undefined,
    };
  }

  function editItem<L extends ListName>(list: L, index: number, changes: Partial<RoundForm[L][number]>) {
    setForm((f) => ({ ...f, [list]: f[list].map((item, i) => (i === index ? { ...item, ...changes } : item)) }));
  }

  function itemText<L extends ListName>(list: L, index: number, field: string) {
    const item = form[list][index] as unknown as Record<string, string>;
    return {
      value: item[field],
      onChange: (e: { target: { value: string } }) => {
        editItem(list, index, { [field]: e.target.value } as Partial<RoundForm[L][number]>);
        clearError(`${list}.${index}.${field}`);
      },
      className: input,
      "aria-invalid": !!errors[`${list}.${index}.${field}`] || undefined,
    };
  }

  // Adding, removing and moving shifts the indexes, so that list's errors go.
  function changeList(list: ListName, items: Item[]) {
    setForm((f) => ({ ...f, [list]: items }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${list}.`))));
  }

  function controls(list: ListName, index: number) {
    const items: Item[] = form[list];
    return (
      <ItemControls
        index={index}
        count={items.length}
        onMove={(to) => changeList(list, moved(items, index, to))}
        onRemove={() => changeList(list, items.filter((_, i) => i !== index))}
      />
    );
  }

  /** Puts removed items that are still in use back where they were. */
  function restore(current: RoundForm, ids: string[]): { form: RoundForm; kept: Partial<Record<ListName, string[]>> } {
    const next = { ...current };
    const names: Partial<Record<ListName, string[]>> = {};
    for (const list of LISTS) {
      const items: Item[] = [...current[list]];
      const present = new Set(items.map((item) => item.id));
      (saved[list] as Item[]).forEach((item, index) => {
        if (item.id && ids.includes(item.id) && !present.has(item.id)) {
          items.splice(Math.min(index, items.length), 0, item);
          (names[list] ??= []).push(itemLabel(item));
        }
      });
      (next as Record<ListName, Item[]>)[list] = items;
    }
    return { form: next, kept: names };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    startTransition(async () => {
      const result = await saveRoundAction(form);
      if ("ok" in result) {
        setSaved(result.round);
        setForm(result.round);
        setErrors({});
        setKept({});
        setNotice("Gespeichert.");
        return;
      }
      setErrors(result.errors);
      if (result.inUse?.length) {
        const restored = restore(form, result.inUse);
        setForm(restored.form);
        setKept(restored.kept);
      } else {
        setKept({});
      }
    });
  }

  function keptNote(list: ListName) {
    const names = kept[list];
    if (!names?.length) return null;
    return (
      <p className={errorText}>
        {names.map((n) => `„${n}“`).join(", ")} {IN_USE[list]} und wurde wiederhergestellt. Umbenennen und Umsortieren geht weiterhin.
      </p>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Grunddaten</h2>
        <Field label="Titel" error={errors.title}>
          <input {...text("title")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Jahr" error={errors.year}>
            <input {...text("year")} inputMode="numeric" />
          </Field>
          <Field label="Plätze" error={errors.seats}>
            <input {...text("seats")} inputMode="numeric" />
          </Field>
          <Field label="Umbuchungsfrist (Stunden vorher)" error={errors.rebookHoursBefore}>
            <input {...text("rebookHoursBefore")} inputMode="numeric" />
          </Field>
          <Field label="Gesprächsdauer (Minuten)" error={errors.interviewMinutes}>
            <input {...text("interviewMinutes")} inputMode="numeric" />
          </Field>
          <Field label="Puffer (Minuten)" error={errors.bufferMinutes}>
            <input {...text("bufferMinutes")} inputMode="numeric" />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Termine</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bewerbungsphase: Beginn" note="Deutsche Zeit" error={errors.applicationOpensAt}>
            <input {...text("applicationOpensAt")} type="datetime-local" />
          </Field>
          <Field label="Bewerbungsphase: Ende" note="Deutsche Zeit" error={errors.applicationClosesAt}>
            <input {...text("applicationClosesAt")} type="datetime-local" />
          </Field>
          <Field label="Gespräche ab" error={errors.interviewsFrom}>
            <input {...text("interviewsFrom")} type="date" />
          </Field>
          <Field label="Gespräche bis" error={errors.interviewsUntil}>
            <input {...text("interviewsUntil")} type="date" />
          </Field>
          <Field label="Löschdatum" error={errors.deletionDate}>
            <input {...text("deletionDate")} type="date" />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Mail</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Versandweg" error={errors.mailTransport}>
            <select {...text("mailTransport")}>
              <option value="gmail">Gmail-Konto des Tools</option>
              <option value="graph">Funktionspostfach (Microsoft Graph)</option>
            </select>
          </Field>
          <Field label="Antwortadresse" error={errors.replyTo}>
            <input {...text("replyTo")} type="email" />
          </Field>
        </div>
        <Field label="Datenschutzhinweis" note="Erscheint im Bewerbungsformular." error={errors.privacyNotice}>
          <textarea {...text("privacyNotice")} rows={6} />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Bewerbungsfragen</h2>
        {keptNote("questions")}
        {form.questions.map((q, i) => (
          <div key={q.key} className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
            <Field label={`Frage ${i + 1}`} error={errors[`questions.${i}.text`]}>
              <textarea {...itemText("questions", i, "text")} rows={2} />
            </Field>
            {controls("questions", i)}
          </div>
        ))}
        <button
          type="button"
          className={`${secondaryButton} self-start`}
          onClick={() => changeList("questions", [...form.questions, { key: crypto.randomUUID(), id: null, text: "" }])}
        >
          + Frage hinzufügen
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Ressorts</h2>
        {keptNote("departments")}
        {form.departments.map((d, i) => (
          <div key={d.key} className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
            <Field label="Name" error={errors[`departments.${i}.name`]}>
              <input {...itemText("departments", i, "name")} />
            </Field>
            <Field label="Beschreibung (ein Satz)">
              <input {...itemText("departments", i, "description")} />
            </Field>
            {controls("departments", i)}
          </div>
        ))}
        <button
          type="button"
          className={`${secondaryButton} self-start`}
          onClick={() =>
            changeList("departments", [...form.departments, { key: crypto.randomUUID(), id: null, name: "", description: "" }])
          }
        >
          + Ressort hinzufügen
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Feedback-Kriterien</h2>
        {keptNote("criteria")}
        {form.criteria.map((c, i) => (
          <div key={c.key} className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
            <Field label="Name" error={errors[`criteria.${i}.name`]}>
              <input {...itemText("criteria", i, "name")} />
            </Field>
            <Field label="Beschreibung">
              <input {...itemText("criteria", i, "description")} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Gewicht" error={errors[`criteria.${i}.weight`]}>
                <input {...itemText("criteria", i, "weight")} inputMode="decimal" />
              </Field>
              <Field label="Skala von" error={errors[`criteria.${i}.scaleMin`]}>
                <input {...itemText("criteria", i, "scaleMin")} inputMode="numeric" />
              </Field>
              <Field label="bis" error={errors[`criteria.${i}.scaleMax`]}>
                <input {...itemText("criteria", i, "scaleMax")} inputMode="numeric" />
              </Field>
            </div>
            {controls("criteria", i)}
          </div>
        ))}
        <button
          type="button"
          className={`${secondaryButton} self-start`}
          onClick={() => changeList("criteria", [...form.criteria, newCriterion(crypto.randomUUID())])}
        >
          + Kriterium hinzufügen
        </button>
      </section>

      <div className="flex flex-col gap-2">
        {errors.form && <p className={errorText}>{errors.form}</p>}
        {hasErrors && !errors.form && <p className={errorText}>Bitte die markierten Felder prüfen. Nichts gespeichert.</p>}
        {notice && <p className="text-green-700">{notice}</p>}
        <button disabled={pending} className={`${button} self-start`}>
          {pending ? "Speichern …" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
