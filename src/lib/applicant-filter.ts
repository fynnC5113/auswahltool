// Search and filters for /bewerbungen (Phase 13). Pure functions, no database:
// the list is loaded once and filtered in the browser (about 30 applications).
export type ApplicantStatus = "active" | "no_show";

export type Searchable = {
  name: string;
  email: string;
  cohort: string;
  departmentIds: string[];
  departmentAll: boolean;
  status: ApplicantStatus;
  /** Answer texts in question order. */
  answers: string[];
};

export type Filter = {
  query: string;
  /** "" = every cohort. */
  cohort: string;
  /** "" = every department, "all" = "für alle offen", else a department id. */
  department: string;
  /** "" = every status. */
  status: "" | ApplicantStatus;
};

export const NO_FILTER: Filter = { query: "", cohort: "", department: "", status: "" };

const fold = (text: string) => text.normalize("NFC").toLocaleLowerCase("de");

/** Search words; every word must occur somewhere (name, mail or an answer). */
function words(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

export function matchesFilter(item: Searchable, filter: Filter): boolean {
  if (filter.cohort && item.cohort !== filter.cohort) return false;
  if (filter.department === "all" && !item.departmentAll) return false;
  if (filter.department && filter.department !== "all" && !item.departmentIds.includes(filter.department)) return false;
  if (filter.status && item.status !== filter.status) return false;
  const haystack = [item.name, item.email, ...item.answers].map(fold);
  return words(filter.query).every((w) => haystack.some((h) => h.includes(w)));
}

export type Snippet = { before: string; match: string; after: string };

/**
 * The first answer passage that contains the first search word, with some
 * context, for showing under the name. null if the name or mail already
 * matches or no answer contains it.
 */
export function answerSnippet(item: Searchable, query: string, context = 40): Snippet | null {
  const [word] = words(query);
  if (!word) return null;
  if (fold(item.name).includes(word) || fold(item.email).includes(word)) return null;
  for (const answer of item.answers) {
    const text = answer.normalize("NFC");
    const at = fold(text).indexOf(word);
    if (at < 0) continue;
    const from = Math.max(0, at - context);
    const to = Math.min(text.length, at + word.length + context);
    return {
      before: (from > 0 ? "…" : "") + text.slice(from, at),
      match: text.slice(at, at + word.length),
      after: text.slice(at + word.length, to) + (to < text.length ? "…" : ""),
    };
  }
  return null;
}
