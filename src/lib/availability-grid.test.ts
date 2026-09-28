import { describe, expect, it } from "vitest";
import {
  blockedIn,
  dayCells,
  gridDays,
  isCellStart,
  normalizeInstant,
  parseMaxInterviews,
  validateSelection,
} from "./availability-grid";

describe("gridDays", () => {
  it("lists every day inclusive, across month ends", () => {
    expect(gridDays("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("is empty if until is before from", () => {
    expect(gridDays("2026-10-20", "2026-10-19")).toEqual([]);
  });
});

describe("dayCells", () => {
  it("has 48 cells from 08:00 to 19:45 Berlin time", () => {
    const cells = dayCells("2026-10-20");
    expect(cells).toHaveLength(48);
    expect(cells[0]).toEqual({ start: "2026-10-20T06:00:00.000Z", end: "2026-10-20T06:15:00.000Z", label: "08:00" });
    expect(cells.at(-1)).toEqual({ start: "2026-10-20T17:45:00.000Z", end: "2026-10-20T18:00:00.000Z", label: "19:45" });
  });
  it("uses winter time after the change on 25.10.2026", () => {
    expect(dayCells("2026-10-24")[0].start).toBe("2026-10-24T06:00:00.000Z");
    expect(dayCells("2026-10-25")[0].start).toBe("2026-10-25T07:00:00.000Z");
    expect(dayCells("2026-10-26")[0].start).toBe("2026-10-26T07:00:00.000Z");
  });
});

describe("isCellStart and validateSelection", () => {
  const days = ["2026-10-20", "2026-10-21"];

  it("accepts cell starts in either timestamp format", () => {
    expect(isCellStart("2026-10-20T06:00:00.000Z", days)).toBe(true);
    expect(isCellStart("2026-10-20T06:15:00+00:00", days)).toBe(true);
  });
  it("rejects times outside the grid", () => {
    expect(isCellStart("2026-10-20T06:05:00.000Z", days)).toBe(false); // not on the 15-minute grid
    expect(isCellStart("2026-10-20T05:45:00.000Z", days)).toBe(false); // 07:45
    expect(isCellStart("2026-10-20T18:00:00.000Z", days)).toBe(false); // 20:00
    expect(isCellStart("2026-10-22T06:00:00.000Z", days)).toBe(false); // other day
    expect(isCellStart("kein Datum", days)).toBe(false);
  });
  it("normalizes, sorts and removes duplicates", () => {
    expect(
      validateSelection(["2026-10-21T06:00:00+00:00", "2026-10-20T06:00:00.000Z", "2026-10-21T06:00:00.000Z"], days),
    ).toEqual({ value: ["2026-10-20T06:00:00.000Z", "2026-10-21T06:00:00.000Z"] });
    expect(validateSelection([], days)).toEqual({ value: [] });
  });
  it("rejects anything that is not a list of cell starts", () => {
    expect(validateSelection("2026-10-20T06:00:00.000Z", days)).toHaveProperty("error");
    expect(validateSelection([42], days)).toHaveProperty("error");
    expect(validateSelection(["2026-10-22T06:00:00.000Z"], days)).toHaveProperty("error");
  });
});

describe("blockedIn", () => {
  const blocked = [{ startsAt: "2026-10-20T08:00:00.000Z", endsAt: "2026-10-20T09:30:00.000Z", location: "0.23", note: "Beratung" }];
  const cell = (start: string) => ({ start, end: new Date(Date.parse(start) + 15 * 60 * 1000).toISOString() });

  it("marks cells that overlap a blocked time", () => {
    expect(blockedIn(cell("2026-10-20T08:00:00.000Z"), blocked)).toHaveLength(1);
    expect(blockedIn(cell("2026-10-20T09:15:00.000Z"), blocked)).toHaveLength(1);
  });
  it("does not mark cells that only touch it", () => {
    expect(blockedIn(cell("2026-10-20T07:45:00.000Z"), blocked)).toHaveLength(0);
    expect(blockedIn(cell("2026-10-20T09:30:00.000Z"), blocked)).toHaveLength(0);
  });
  it("marks a cell partly covered by a blocked time off the grid", () => {
    const odd = [{ ...blocked[0], startsAt: "2026-10-20T10:05:00.000Z", endsAt: "2026-10-20T10:10:00.000Z" }];
    expect(blockedIn(cell("2026-10-20T10:00:00.000Z"), odd)).toHaveLength(1);
  });
});

describe("parseMaxInterviews", () => {
  it("empty means no limit", () => expect(parseMaxInterviews("  ")).toEqual({ value: null }));
  it("accepts whole numbers from 0", () => {
    expect(parseMaxInterviews("0")).toEqual({ value: 0 });
    expect(parseMaxInterviews(" 5 ")).toEqual({ value: 5 });
  });
  it.each(["-1", "2,5", "zwei", "1e3", "5000"])("rejects %s", (raw) => {
    expect(parseMaxInterviews(raw)).toHaveProperty("error");
  });
});

describe("normalizeInstant", () => {
  it("converts Postgres output to ISO", () => {
    expect(normalizeInstant("2026-10-20T06:00:00+00:00")).toBe("2026-10-20T06:00:00.000Z");
    expect(normalizeInstant("x")).toBeNull();
  });
});
