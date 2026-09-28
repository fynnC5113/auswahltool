import { describe, expect, it } from "vitest";
import { berlinToUtc, utcToBerlin } from "./berlin-time";

describe("berlinToUtc", () => {
  it("winter time is UTC+1", () => {
    expect(berlinToUtc("2026-01-15T10:00")).toBe("2026-01-15T09:00:00.000Z");
  });

  it("summer time is UTC+2", () => {
    expect(berlinToUtc("2026-10-01T09:00")).toBe("2026-10-01T07:00:00.000Z");
  });

  it("clock change on 25.10.2026 (03:00 summer time becomes 02:00 winter time)", () => {
    expect(berlinToUtc("2026-10-25T01:30")).toBe("2026-10-24T23:30:00.000Z");
    // 02:30 occurs twice: the earlier one (still summer time) is taken.
    expect(berlinToUtc("2026-10-25T02:30")).toBe("2026-10-25T00:30:00.000Z");
    expect(berlinToUtc("2026-10-25T03:30")).toBe("2026-10-25T02:30:00.000Z");
    expect(berlinToUtc("2026-10-26T00:00")).toBe("2026-10-25T23:00:00.000Z");
  });

  it("the missing hour on 29.03.2026 is moved forward", () => {
    expect(berlinToUtc("2026-03-29T01:30")).toBe("2026-03-29T00:30:00.000Z");
    // 02:30 does not exist; it becomes 03:30 summer time.
    expect(berlinToUtc("2026-03-29T02:30")).toBe("2026-03-29T01:30:00.000Z");
    expect(berlinToUtc("2026-03-29T03:00")).toBe("2026-03-29T01:00:00.000Z");
  });

  it("accepts seconds", () => {
    expect(berlinToUtc("2026-10-01T09:00:30")).toBe("2026-10-01T07:00:30.000Z");
  });

  it.each(["", "abc", "2026-10-01", "2026-02-30T10:00", "2026-10-01T24:00", "2026-10-01T09:60"])(
    "rejects %j",
    (value) => {
      expect(berlinToUtc(value)).toBeNull();
    },
  );
});

describe("utcToBerlin", () => {
  it("shows summer and winter time", () => {
    expect(utcToBerlin("2026-10-01T07:00:00.000Z")).toBe("2026-10-01T09:00");
    expect(utcToBerlin("2026-01-15T09:00:00+00:00")).toBe("2026-01-15T10:00");
  });

  it("round-trips through berlinToUtc", () => {
    for (const local of ["2026-10-01T09:00", "2026-10-15T23:59", "2026-10-25T03:30", "2026-12-31T00:00"]) {
      expect(utcToBerlin(berlinToUtc(local)!)).toBe(local);
    }
  });
});
