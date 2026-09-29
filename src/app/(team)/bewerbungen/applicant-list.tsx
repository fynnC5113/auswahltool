"use client";

// List with search and filters (variant A, Fynn 29.09.2026): one quiet row per
// application, filtered in the browser as you type.
import Link from "next/link";
import { useState } from "react";
import { NO_FILTER, answerSnippet, matchesFilter, type Filter } from "@/lib/applicant-filter";
import type { TeamListItem } from "@/lib/applicant-team";
import { input } from "../../ui";

const select = "min-w-0 rounded border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const slotDay = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const chip = "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium";

function SlotChip({ item }: { item: TeamListItem }) {
  if (item.status === "no_show")
    return <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>nicht erschienen</span>;
  if (item.slotStartsAt)
    return (
      <span className={`${chip} bg-zinc-900 text-white tabular-nums dark:bg-zinc-100 dark:text-zinc-900`}>
        {slotDay.format(new Date(item.slotStartsAt)).replace(",", "")}
      </span>
    );
  return <span className={`${chip} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`}>kein Termin</span>;
}

export function ApplicantList({
  items,
  departments,
}: {
  items: TeamListItem[];
  departments: { id: string; name: string }[];
}) {
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const set = (change: Partial<Filter>) => setFilter((f) => ({ ...f, ...change }));
  const cohorts = [...new Set(items.map((i) => i.cohort))].sort().reverse();
  const shown = items.filter((i) => matchesFilter(i, filter));
  const filtered = shown.length < items.length;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        aria-label="Suchen"
        placeholder="Suchen in Namen und Antworten"
        value={filter.query}
        onChange={(e) => set({ query: e.target.value })}
        className={input}
      />
      <div className="grid grid-cols-3 gap-2">
        <select aria-label="Jahrgang" value={filter.cohort} onChange={(e) => set({ cohort: e.target.value })} className={select}>
          <option value="">Jahrgang</option>
          {cohorts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Ressort" value={filter.department} onChange={(e) => set({ department: e.target.value })} className={select}>
          <option value="">Ressort</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          <option value="unsure">weiß noch nicht</option>
        </select>
        <select
          aria-label="Status"
          value={filter.status}
          onChange={(e) => set({ status: e.target.value as Filter["status"] })}
          className={select}
        >
          <option value="">Status</option>
          <option value="active">aktiv</option>
          <option value="no_show">nicht erschienen</option>
        </select>
      </div>
      {filtered && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {shown.length} von {items.length} ·{" "}
          <button type="button" onClick={() => setFilter(NO_FILTER)} className="underline">
            Filter zurücksetzen
          </button>
        </p>
      )}

      {shown.length === 0 ? (
        <p className="py-4 text-sm text-zinc-600 dark:text-zinc-400">Keine Bewerbung passt zur Suche.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {shown.map((item) => {
            const snippet = answerSnippet(item, filter.query);
            return (
              <li key={item.id}>
                <Link
                  href={`/bewerbungen/${item.id}`}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 px-1 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="font-semibold">{item.name}</span>
                  <SlotChip item={item} />
                  <span className="col-span-2 text-sm text-zinc-600 dark:text-zinc-400">
                    Jahrgang {item.cohort} ·{" "}
                    {item.departmentUnsure ? "Ressort: weiß noch nicht" : item.departments.join(", ") || "kein Ressort"}
                    {item.conflicts.length > 0 && (
                      <span className="text-amber-800 dark:text-amber-300"> · befangen: {item.conflicts.join(", ")}</span>
                    )}
                  </span>
                  {snippet && (
                    <span className="col-span-2 text-sm text-zinc-600 dark:text-zinc-400">
                      „{snippet.before}
                      <mark className="rounded-sm bg-amber-200 text-inherit dark:bg-amber-800">{snippet.match}</mark>
                      {snippet.after}“
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
