import { describe, expect, it } from "vitest";
import { OVERALL, missingFeedback, missingParts, ownState, sightLocked, type Criterion } from "./feedback-rules";

const criteria: Criterion[] = [
  { id: "c1", name: "Sympathie", description: "", scaleMin: 1, scaleMax: 10 },
  { id: "c2", name: "Teamfit", description: "", scaleMin: 1, scaleMax: 5 },
];

describe("missingParts", () => {
  it("needs a score and a reason for every criterion and the overall text", () => {
    expect(missingParts(criteria, { overall: "", scores: [] })).toEqual(["c1", "c2", OVERALL]);
    expect(
      missingParts(criteria, {
        overall: "Gut.",
        scores: [
          { criterionId: "c1", score: 7, text: "Offen." },
          { criterionId: "c2", score: 4, text: "" },
        ],
      }),
    ).toEqual(["c2"]);
  });

  it("does not accept blanks as a reason", () => {
    expect(
      missingParts(criteria, {
        overall: "  ",
        scores: [
          { criterionId: "c1", score: 1, text: " \n" },
          { criterionId: "c2", score: null, text: "Passt." },
        ],
      }),
    ).toEqual(["c1", "c2", OVERALL]);
  });

  it("is empty when everything is filled in", () => {
    expect(
      missingParts(criteria, {
        overall: "Gut.",
        scores: [
          { criterionId: "c1", score: 1, text: "a" },
          { criterionId: "c2", score: 5, text: "b" },
        ],
      }),
    ).toEqual([]);
  });
});

describe("missingFeedback", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  const interview = (applicantId: string, end: string, noShow = false) => ({
    applicantId,
    interviewers: ["a", "b"],
    interviewEndsAt: end,
    noShow,
  });

  it("counts only ended interviews and skips no-shows", () => {
    const result = missingFeedback(
      [interview("past", "2026-10-20T09:00:00Z"), interview("running", "2026-10-20T10:30:00Z"), interview("gone", "2026-10-20T08:00:00Z", true)],
      [],
      now,
    );
    expect(result).toEqual([
      { applicantId: "past", memberId: "a", state: "none" },
      { applicantId: "past", memberId: "b", state: "none" },
    ]);
  });

  it("drops submitted entries and marks drafts", () => {
    const result = missingFeedback(
      [interview("x", "2026-10-20T09:00:00Z")],
      [
        { applicantId: "x", memberId: "a", submitted: true },
        { applicantId: "x", memberId: "b", submitted: false },
      ],
      now,
    );
    expect(result).toEqual([{ applicantId: "x", memberId: "b", state: "draft" }]);
  });

  it("counts an interview that ends exactly now", () => {
    expect(missingFeedback([interview("x", "2026-10-20T10:00:00Z")], [], now)).toHaveLength(2);
  });
});

describe("ownState", () => {
  it("tells none, draft and submitted apart", () => {
    expect(ownState(undefined)).toBe("none");
    expect(ownState({ submitted: false })).toBe("draft");
    expect(ownState({ submitted: true })).toBe("submitted");
  });
});

describe("sightLocked", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const base = { isInterviewer: true, ownSubmitted: false, lifted: false, selectionStartedAt: null, now };

  it("locks an interviewer without own submission", () => {
    expect(sightLocked(base)).toBe(true);
  });

  it("opens under each of the four conditions", () => {
    expect(sightLocked({ ...base, isInterviewer: false })).toBe(false);
    expect(sightLocked({ ...base, ownSubmitted: true })).toBe(false);
    expect(sightLocked({ ...base, lifted: true })).toBe(false);
    expect(sightLocked({ ...base, selectionStartedAt: new Date("2026-10-25T11:00:00Z") })).toBe(false);
  });

  it("stays locked when the selection round starts later", () => {
    expect(sightLocked({ ...base, selectionStartedAt: new Date("2026-10-26T11:00:00Z") })).toBe(true);
  });
});
