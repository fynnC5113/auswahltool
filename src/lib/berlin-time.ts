// Converts between the value of an <input type="datetime-local"> (wall-clock
// time in Germany) and an ISO timestamp for timestamptz columns.
// Around the clock changes it behaves like Temporal's "compatible" mode:
// a time that occurs twice (autumn) is the earlier one, a time that does not
// exist (spring) is moved forward by the gap.

const ZONE = "Europe/Berlin";
const HOUR = 60 * 60 * 1000;

const wallClock = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Berlin wall-clock time of an instant, expressed as if it were UTC. */
function berlinWallMs(instant: number): number {
  const parts: Record<string, number> = {};
  for (const { type, value } of wallClock.formatToParts(instant)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function offsetAt(instant: number): number {
  return berlinWallMs(instant) - Math.floor(instant / 1000) * 1000;
}

/** "2026-10-01T09:00" (Berlin) → "2026-10-01T07:00:00.000Z". null if invalid. */
export function berlinToUtc(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const before = wall - offsetAt(wall - 24 * HOUR);
  const after = wall - offsetAt(wall + 24 * HOUR);
  const valid = [before, after].filter((t) => berlinWallMs(t) === wall);
  // Two valid instants: the earlier one. None: the time falls into the spring
  // gap; the offset before the change moves it forward.
  const instant = valid.length ? Math.min(...valid) : before;
  return new Date(instant).toISOString();
}

/** ISO timestamp → "2026-10-01T09:00" (Berlin), for datetime-local inputs. */
export function utcToBerlin(iso: string): string {
  return new Date(berlinWallMs(Date.parse(iso))).toISOString().slice(0, 16);
}
