import { describe, expect, it } from "vitest";
import { phaseText, roundPhase, type PhaseRound } from "./round-phase";

const round: PhaseRound = {
  opensAt: new Date("2026-09-30T22:00:00Z"), // 01.10. 00:00 Berlin
  closesAt: new Date("2026-10-15T21:59:00Z"), // 15.10. 23:59 Berlin
  interviewsFrom: "2026-10-20",
  interviewsUntil: "2026-10-31",
  selectionStartedAt: null,
  boardFrozenAt: null,
};
const at = (iso: string) => new Date(iso);

describe("roundPhase", () => {
  it("follows the round from start to frozen board", () => {
    expect(roundPhase(round, at("2026-09-29T12:00:00Z"))).toBe("before");
    expect(roundPhase(round, at("2026-09-30T22:00:00Z"))).toBe("application");
    expect(roundPhase(round, at("2026-10-15T21:59:00Z"))).toBe("interviews");
    const started = { ...round, selectionStartedAt: at("2026-11-05T17:00:00Z") };
    expect(roundPhase(started, at("2026-11-05T16:59:00Z"))).toBe("interviews");
    expect(roundPhase(started, at("2026-11-05T17:00:00Z"))).toBe("selection");
    expect(roundPhase({ ...started, boardFrozenAt: at("2026-11-05T19:00:00Z") }, at("2026-11-05T19:00:00Z"))).toBe("frozen");
  });
});

describe("phaseText", () => {
  it("names the deadline in Berlin time", () => {
    expect(phaseText(round, at("2026-10-02T10:00:00Z"))).toEqual({
      title: "Bewerbungsphase läuft",
      text: "bis Do., 15.10., 23:59 Uhr.",
    });
    expect(phaseText(round, at("2026-09-29T10:00:00Z")).text).toBe("Die Bewerbungsphase beginnt Do., 01.10., 00:00 Uhr.");
  });

  it("interviews, then 'vorbei' after the last interview day (Berlin)", () => {
    expect(phaseText(round, at("2026-10-20T08:00:00Z"))).toEqual({ title: "Gespräche", text: "vom Di., 20.10. bis Sa., 31.10." });
    expect(phaseText(round, at("2026-10-31T23:30:00Z")).title).toBe("Gespräche vorbei");
    expect(phaseText(round, at("2026-10-31T23:30:00Z")).text).toBe("Die Auswahlrunde ist noch nicht gestartet.");
  });
});
