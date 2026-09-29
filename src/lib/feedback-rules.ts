// Feedback rules without a database (Phase 14, Fynn 29.09.2026): what is
// missing before submitting, which feedback counts as missing, and when the
// sight lock hides the partner's entry. The database checks the same rules
// again in public.save_feedback.

export type Criterion = { id: string; name: string; description: string; scaleMin: number; scaleMax: number };
export type ScoreInput = { criterionId: string; score: number | null; text: string };
export type FeedbackInput = { overall: string; scores: ScoreInput[] };

/** Key of the overall text in the list of missing parts. */
export const OVERALL = "overall";

/** Criterion ids without score or reason, then OVERALL if the overall text is empty. */
export function missingParts(criteria: Criterion[], input: FeedbackInput): string[] {
  const missing = criteria
    .filter((c) => {
      const s = input.scores.find((x) => x.criterionId === c.id);
      return !s || s.score === null || !s.text.trim();
    })
    .map((c) => c.id);
  if (!input.overall.trim()) missing.push(OVERALL);
  return missing;
}

/** Own entry: none yet, draft, or submitted. */
export type OwnState = "none" | "draft" | "submitted";

export function ownState(entry: { submitted: boolean } | undefined): OwnState {
  if (!entry) return "none";
  return entry.submitted ? "submitted" : "draft";
}

export type BookedInterview = {
  applicantId: string;
  interviewers: string[];
  interviewEndsAt: string;
  noShow: boolean;
};
export type Progress = { applicantId: string; memberId: string; submitted: boolean };
export type MissingEntry = { applicantId: string; memberId: string; state: "none" | "draft" };

/**
 * Missing feedback (decisions 4a and 6): only after the end of the
 * interview, and not for applicants marked "nicht erschienen".
 */
export function missingFeedback(interviews: BookedInterview[], progress: Progress[], now: Date): MissingEntry[] {
  return interviews
    .filter((i) => !i.noShow && new Date(i.interviewEndsAt) <= now)
    .flatMap((i) =>
      i.interviewers.flatMap((memberId): MissingEntry[] => {
        const entry = progress.find((p) => p.applicantId === i.applicantId && p.memberId === memberId);
        if (entry?.submitted) return [];
        return [{ applicantId: i.applicantId, memberId, state: entry ? "draft" : "none" }];
      }),
    );
}

/**
 * Does the sight lock hide the partner's entry from this member? Mirrors
 * private.can_read_feedback; the database decides, this only picks the text.
 */
export function sightLocked(args: {
  isInterviewer: boolean;
  ownSubmitted: boolean;
  lifted: boolean;
  selectionStartedAt: Date | null;
  now: Date;
}): boolean {
  if (!args.isInterviewer || args.ownSubmitted || args.lifted) return false;
  return !(args.selectionStartedAt && args.selectionStartedAt <= args.now);
}
