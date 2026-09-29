// Where the round stands, for the overview (Phase 13). Pure, no database.
export type Phase = "before" | "application" | "interviews" | "selection" | "frozen";

export type PhaseRound = {
  opensAt: Date;
  closesAt: Date;
  /** yyyy-mm-dd, Berlin. */
  interviewsFrom: string;
  interviewsUntil: string;
  selectionStartedAt: Date | null;
  boardFrozenAt: Date | null;
};

export function roundPhase(round: PhaseRound, now = new Date()): Phase {
  if (round.boardFrozenAt && round.boardFrozenAt <= now) return "frozen";
  if (round.selectionStartedAt && round.selectionStartedAt <= now) return "selection";
  if (now < round.opensAt) return "before";
  if (now < round.closesAt) return "application";
  return "interviews";
}

const dateTime = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const day = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
/** A date column (yyyy-mm-dd) as "Mo., 20.10.". */
const dateOnly = (d: string) => day.format(new Date(`${d}T00:00:00Z`));
const berlinToday = (now: Date) => now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Headline and sentence for the overview. */
export function phaseText(round: PhaseRound, now = new Date()): { title: string; text: string } {
  switch (roundPhase(round, now)) {
    case "before":
      return { title: "Vor Beginn", text: `Die Bewerbungsphase beginnt ${dateTime.format(round.opensAt)} Uhr.` };
    case "application":
      return { title: "Bewerbungsphase läuft", text: `bis ${dateTime.format(round.closesAt)} Uhr.` };
    case "interviews":
      return berlinToday(now) > round.interviewsUntil
        ? { title: "Gespräche vorbei", text: "Die Auswahlrunde ist noch nicht gestartet." }
        : // The date already ends with a full stop.
          { title: "Gespräche", text: `vom ${dateOnly(round.interviewsFrom)} bis ${dateOnly(round.interviewsUntil)}` };
    case "selection":
      return { title: "Auswahlrunde läuft", text: "Die Sichtsperre ist für alle aufgehoben." };
    case "frozen":
      return { title: "Board eingefroren", text: "Das Ergebnis steht fest." };
  }
}
