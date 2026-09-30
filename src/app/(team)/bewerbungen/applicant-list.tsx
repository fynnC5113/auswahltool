"use client";

// List with search and filters (variant A, Fynn 29.09.2026): one quiet row per
// application, filtered in the browser as you type.
import Link from "next/link";
import { useState } from "react";
import { NO_FILTER, answerSnippet, matchesFilter, type Filter } from "@/lib/applicant-filter";
import type { TeamListItem } from "@/lib/applicant-team";
import { chip, formGroup, input, lead, select, textButton } from "../../ui";

const slotDay = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

function SlotChip({ item }: { item: TeamListItem }) {
  if (item.status === "no_show")
    return <span className={`${chip} bg-warn-soft text-warn`}>nicht erschienen</span>;
  if (item.slotStartsAt)
    return (
      <span className={`${chip} bg-accent-soft text-accent tabular-nums`}>
        {slotDay.format(new Date(item.slotStartsAt)).replace(",", "")}
      </span>
    );
  return <span className={`${chip} text-muted`}>kein Termin</span>;
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
      <div className={formGroup}>
      <input
        type="search"
        aria-label="Suchen"
        placeholder="Suchen in Namen und Antworten"
        value={filter.query}
        onChange={(e) => set({ query: e.target.value })}
        className={input}
      />
      <div className="grid grid-cols-3 gap-2 [&>select]:bg-[position:right_7px_center] [&>select]:pr-6 [&>select]:pl-2.5">
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
          <option value="all">für alle offen</option>
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
      </div>
      {filtered && (
        <p className={`flex flex-wrap gap-x-3 ${lead}`}>
          <span>
            {shown.length} von {items.length}
          </span>
          <button type="button" onClick={() => setFilter(NO_FILTER)} className={textButton}>
            Filter zurücksetzen
          </button>
        </p>
      )}

      {shown.length === 0 ? (
        <p className={`py-4 ${lead}`}>Keine Bewerbung passt zur Suche.</p>
      ) : (
        <ul className="list flex flex-col overflow-hidden rounded-group bg-surface">
          {shown.map((item) => {
            const snippet = answerSnippet(item, filter.query);
            return (
              <li key={item.id}>
                <Link
                  href={`/bewerbungen/${item.id}`}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 px-4 py-3 hover:bg-field"
                >
                  <span className="font-medium">{item.name}</span>
                  <SlotChip item={item} />
                  <span className="col-span-2 text-note text-muted">
                    Jahrgang {item.cohort} ·{" "}
                    {item.departmentAll
                      ? "Ressort: für alle offen"
                      : item.departments.join(", ") || "kein Ressort"}
                    {item.conflicts.length > 0 && (
                      <span className="text-warn"> · befangen: {item.conflicts.join(", ")}</span>
                    )}
                  </span>
                  {snippet && (
                    <span className="col-span-2 text-note text-muted">
                      „{snippet.before}
                      <mark className="rounded-[3px] bg-warn-soft text-warn">{snippet.match}</mark>
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
