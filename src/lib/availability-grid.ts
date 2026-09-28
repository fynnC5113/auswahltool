// The availability grid (/verfuegbarkeit): 15-minute cells from 08:00 to 20:00
// Berlin time on every interview day of the round. Pure functions, no database.
import { berlinToUtc, utcToBerlin } from "@/lib/berlin-time";

export const CELL_MINUTES = 15;
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;
const CELL_MS = CELL_MINUTES * 60 * 1000;

export type Cell = { start: string; end: string; label: string };
export type Blocked = { startsAt: string; endsAt: string; location: string; note: string };

/** "2026-10-20" … "2026-10-22", inclusive. Empty if until is before from. */
export function gridDays(from: string, until: string): string[] {
  const days: string[] = [];
  const end = Date.parse(`${until}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** All cells of one day, start and end as ISO timestamps (UTC). */
export function dayCells(day: string): Cell[] {
  const cells: Cell[] = [];
  for (let minutes = DAY_START_HOUR * 60; minutes < DAY_END_HOUR * 60; minutes += CELL_MINUTES) {
    const label = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const start = berlinToUtc(`${day}T${label}`)!;
    cells.push({ start, end: cellEnd(start), label });
  }
  return cells;
}

export function cellEnd(start: string): string {
  return new Date(Date.parse(start) + CELL_MS).toISOString();
}

/** "2026-10-20T06:00:00+00:00" → "2026-10-20T06:00:00.000Z"; null if no date. */
export function normalizeInstant(value: string): string | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Is start (ISO) the start of a cell on one of the days? */
export function isCellStart(start: string, days: string[]): boolean {
  const instant = normalizeInstant(start);
  if (!instant) return false;
  const local = utcToBerlin(instant);
  if (!days.includes(local.slice(0, 10))) return false;
  return dayCells(local.slice(0, 10)).some((cell) => cell.start === instant);
}

/** Blocked times that overlap the cell (touching at the edge does not count). */
export function blockedIn(cell: Pick<Cell, "start" | "end">, blocked: Blocked[]): Blocked[] {
  const start = Date.parse(cell.start);
  const end = Date.parse(cell.end);
  return blocked.filter((b) => Date.parse(b.startsAt) < end && Date.parse(b.endsAt) > start);
}

/** Empty = no limit. Otherwise a whole number from 0. */
export function parseMaxInterviews(raw: string): { value: number | null } | { error: string } {
  const text = raw.trim();
  if (!text) return { value: null };
  if (!/^\d+$/.test(text) || Number(text) > 1000) {
    return { error: "Bitte eine ganze Zahl ab 0 eingeben oder das Feld leer lassen." };
  }
  return { value: Number(text) };
}

/** Unique, normalized cell starts, or an error if one is not in the grid. */
export function validateSelection(starts: unknown, days: string[]): { value: string[] } | { error: string } {
  if (!Array.isArray(starts)) return { error: "Ungültige Auswahl." };
  const unique = new Set<string>();
  for (const start of starts) {
    if (typeof start !== "string" || !isCellStart(start, days)) {
      return { error: "Die Auswahl enthält Zeiten außerhalb der Gesprächstage. Bitte Seite neu laden." };
    }
    unique.add(normalizeInstant(start)!);
  }
  return { value: [...unique].sort() };
}
