"use client";

import { useRef, useState, useTransition } from "react";
import { barButton, bottomBar, smallButton } from "../../ui";
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
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" role="tablist" aria-label="Gesprächstage">
        {days.map((d, index) => {
          const count = countOn(d);
          return (
            <button
              key={d.day}
              type="button"
              role="tab"
              aria-selected={index === dayIndex}
              onClick={() => switchDay(index)}
              className={`h-11 shrink-0 rounded-field px-3 text-note font-medium tabular-nums ${
                index === dayIndex ? "bg-accent text-on-accent" : "bg-surface shadow-[inset_0_0_0_1px_var(--c-line)]"
              }`}
            >
              {d.label}
              {count > 0 && <span className="ml-1 text-small opacity-75">({count * 15 / 60} h)</span>}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-note">
        <span className="text-muted">Antippen:</span>
        {(["single", "range"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setAnchor(null);
            }}
            className={`${smallButton} aria-pressed:bg-accent aria-pressed:text-on-accent aria-pressed:shadow-none`}
          >
            {m === "single" ? "Einzelnes Feld" : "Von–bis"}
          </button>
        ))}
        <button type="button" className={smallButton} onClick={() => setCells(day.cells.map((c) => c.start), true)}>
          Ganzer Tag
        </button>
        <button type="button" className={smallButton} onClick={() => setCells(day.cells.map((c) => c.start), false)}>
          Tag leeren
        </button>
      </div>
      {mode === "range" && (
        <p className="mb-3 text-note text-muted">
          {anchor
            ? `Beginn ${day.cells.find((c) => c.start === anchor)?.label}. Jetzt das letzte Feld antippen.`
            : "Erstes Feld antippen, dann das letzte."}
        </p>
      )}

      <div className="mb-6 flex select-none flex-col rounded-group bg-surface px-3 py-2">
        {day.cells.map((cell) => {
          const on = selected.has(cell.start);
          const blocked = cell.blocked.length > 0;
          const fullHour = cell.label.endsWith(":00");
          return (
            <div key={cell.start} className={`flex items-stretch ${fullHour ? "border-t border-line first:border-t-0" : ""}`}>
              <span className="w-12 shrink-0 py-1 text-small tabular-nums text-muted">
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
                className={`my-px flex min-h-9 flex-1 items-center rounded-[6px] px-2 text-left text-small ${
                  on ? "bg-accent text-on-accent" : blocked ? "hatched bg-field text-muted" : "bg-field"
                } ${anchor === cell.start ? "outline-2 outline-offset-1 outline-accent" : ""}`}
              >
                {blocked && <span className="truncate">{cell.blocked.join(", ")}</span>}
              </button>
            </div>
          );
        })}
      </div>

      <div className={`sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 px-4 py-3 sm:-mx-6 sm:px-6 lg:bottom-0 ${bottomBar}`}>
        <div className="flex items-center gap-2 text-note">
          <label htmlFor="max-interviews">Höchstens</label>
          <input
            id="max-interviews"
            value={max}
            onChange={(e) => {
              setMax(e.target.value);
              setMessage(null);
            }}
            inputMode="numeric"
            placeholder="–"
            aria-describedby="max-hint"
            className="h-11 w-14 rounded-field bg-field px-2 text-center text-body"
          />
          <span>Gespräche</span>
          <button type="button" onClick={save} disabled={pending || !dirty} className={`${barButton} ml-auto`}>
            {pending ? "Speichert …" : "Speichern"}
          </button>
        </div>
        <p id="max-hint" className="mt-1 text-small text-muted">
          {message ? (
            <span className={message.error ? "text-danger" : "text-ok"}>{message.text}</span>
          ) : dirty && !pending ? (
            <span className="text-warn">Nicht gespeichert</span>
          ) : (
            "Leer = unbegrenzt"
          )}
        </p>
      </div>
    </div>
  );
}
