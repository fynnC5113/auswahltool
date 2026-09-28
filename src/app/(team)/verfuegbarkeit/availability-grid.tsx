"use client";

import { useRef, useState, useTransition } from "react";
import { button, input, secondaryButton } from "../../ui";
import { saveAvailabilityAction } from "./actions";

export type GridCell = { start: string; label: string; blocked: string[] };
export type GridDay = { day: string; label: string; cells: GridCell[] };

type Mode = "single" | "range";

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function AvailabilityGrid({
  roundId,
  days,
  initialStarts,
  initialMax,
}: {
  roundId: string;
  days: GridDay[];
  initialStarts: string[];
  initialMax: string;
}) {
  const [saved, setSaved] = useState(() => ({ starts: new Set(initialStarts), max: initialMax }));
  const [selected, setSelected] = useState(() => new Set(initialStarts));
  const [max, setMax] = useState(initialMax);
  const [dayIndex, setDayIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("single");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Mouse drag: the value every touched cell gets (touch devices scroll instead).
  const paint = useRef<boolean | null>(null);

  const day = days[dayIndex];
  const dirty = !sameSet(selected, saved.starts) || max !== saved.max;

  function setCells(starts: string[], on: boolean) {
    setMessage(null);
    setSelected((current) => {
      const next = new Set(current);
      for (const start of starts) {
        if (on) next.add(start);
        else next.delete(start);
      }
      return next;
    });
  }

  function tap(start: string) {
    if (mode === "single") {
      setCells([start], !selected.has(start));
      return;
    }
    if (!anchor) {
      setAnchor(start);
      return;
    }
    const from = day.cells.findIndex((c) => c.start === anchor);
    const to = day.cells.findIndex((c) => c.start === start);
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    // The range takes the opposite of the first cell's state: mark or clear.
    setCells(
      day.cells.slice(lo, hi + 1).map((c) => c.start),
      !selected.has(anchor),
    );
    setAnchor(null);
  }

  function switchDay(index: number) {
    setDayIndex(index);
    setAnchor(null);
  }

  function save() {
    setMessage(null);
    const starts = [...selected];
    startTransition(async () => {
      const result = await saveAvailabilityAction({ roundId, starts, maxInterviews: max });
      if ("error" in result) {
        setMessage({ error: true, text: result.error });
        return;
      }
      setSaved({ starts: new Set(starts), max });
      setMessage({ error: false, text: "Gespeichert." });
    });
  }

  const countOn = (d: GridDay) => d.cells.filter((c) => selected.has(c.start)).length;

  return (
    <div onPointerUp={() => (paint.current = null)} onPointerLeave={() => (paint.current = null)}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Gesprächstage">
        {days.map((d, index) => {
          const count = countOn(d);
          return (
            <button
              key={d.day}
              type="button"
              role="tab"
              aria-selected={index === dayIndex}
              onClick={() => switchDay(index)}
              className={`shrink-0 rounded border px-3 py-2 text-sm ${
                index === dayIndex
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {d.label}
              {count > 0 && <span className="ml-1 text-xs opacity-75">({count * 15 / 60} h)</span>}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span>Antippen:</span>
        {(["single", "range"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setAnchor(null);
            }}
            className={`${secondaryButton} ${mode === m ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
          >
            {m === "single" ? "Einzelnes Feld" : "Von–bis"}
          </button>
        ))}
        <button type="button" className={secondaryButton} onClick={() => setCells(day.cells.map((c) => c.start), true)}>
          Ganzer Tag
        </button>
        <button type="button" className={secondaryButton} onClick={() => setCells(day.cells.map((c) => c.start), false)}>
          Tag leeren
        </button>
      </div>
      {mode === "range" && (
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {anchor
            ? `Beginn ${day.cells.find((c) => c.start === anchor)?.label}. Jetzt das letzte Feld antippen.`
            : "Erstes Feld antippen, dann das letzte."}
        </p>
      )}

      <div className="mb-6 flex select-none flex-col">
        {day.cells.map((cell) => {
          const on = selected.has(cell.start);
          const blocked = cell.blocked.length > 0;
          const fullHour = cell.label.endsWith(":00");
          return (
            <div key={cell.start} className={`flex items-stretch ${fullHour ? "border-t border-zinc-300 dark:border-zinc-700" : ""}`}>
              <span className="w-14 shrink-0 py-1 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                {fullHour ? cell.label : ""}
              </span>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${day.label} ${cell.label}${blocked ? `, ${cell.blocked.join(", ")}` : ""}`}
                onClick={() => tap(cell.start)}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse" && mode === "single") paint.current = !on;
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse" && paint.current !== null && e.buttons === 1) setCells([cell.start], paint.current);
                }}
                className={`my-px flex min-h-9 flex-1 items-center rounded-sm px-2 text-left text-xs ${
                  on
                    ? "bg-emerald-600 text-white"
                    : blocked
                      ? "bg-zinc-300 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                      : "bg-zinc-100 dark:bg-zinc-900"
                } ${anchor === cell.start ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}
              >
                {blocked && <span className="truncate">{cell.blocked.join(", ")}</span>}
              </button>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Höchstens so viele Gespräche (leer = unbegrenzt)
            <input
              value={max}
              onChange={(e) => {
                setMax(e.target.value);
                setMessage(null);
              }}
              inputMode="numeric"
              className={`${input} w-28`}
            />
          </label>
          <button type="button" onClick={save} disabled={pending || !dirty} className={button}>
            {pending ? "Speichert …" : "Speichern"}
          </button>
          {dirty && !pending && <span className="text-sm text-amber-700 dark:text-amber-400">Nicht gespeichert</span>}
          {message && <span className={`text-sm ${message.error ? "text-red-700" : "text-emerald-700"}`}>{message.text}</span>}
        </div>
      </div>
    </div>
  );
}
