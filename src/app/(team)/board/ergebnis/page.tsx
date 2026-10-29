// Result of the selection round (Phase 17, Fynn 30.09.2026): after freezing,
// three groups with names and addresses for all members. The team writes the
// mails in Outlook (no mails from the tool, PRD 6).
import Link from "next/link";
import type { ReactNode } from "react";
import { getMember } from "@/lib/auth/member";
import { boardResult, loadBoard, shortName, type ResultPerson } from "@/lib/board";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../brand";
import { lead, link, listGroup, section, sectionTitle, teamPage } from "../../../ui";
import { CopyAddresses } from "./copy-addresses";

const when = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ResultPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);
  const board = member ? await loadBoard(supabase) : null;

  if (!member || !board || !board.frozen) {
    return (
      <main className={teamPage}>
        <PageHeader heading="Ergebnis">
          Das Ergebnis steht fest, sobald ein Admin das Board einfriert. Bis dahin kann sich noch alles ändern.
        </PageHeader>
        <p>
          <Link href="/board" className={link}>
            Zum Board
          </Link>
        </p>
      </main>
    );
  }

  const result = boardResult(board);
  const deptIndex = new Map(board.departments.map((d, i) => [d.id, i]));

  return (
    <main className={teamPage}>
      <PageHeader heading="Ergebnis">
        Eingefroren am {when.format(new Date(board.frozenAt!))}
        {board.frozenBy && ` von ${board.frozenBy}`}. Die Mails zu Zu- und Absage schreibt ihr in Outlook. „Adressen kopieren“ legt
        die Adressen einer Gruppe mit Semikolon getrennt in die Zwischenablage.{" "}
        <Link href="/board" className={link}>
          Zum Board
        </Link>
      </PageHeader>

      <Group title="Zusage" note="Die Plätze mit dem zugeteilten Ressort. Die Nummer ist keine Rangfolge." people={result.accepted}>
        {result.accepted.map((p) => (
          <Row key={p.id} no={String(p.seat)} person={p}>
            {p.departments.length ? (
              p.departments.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: `var(--c-dept-${(deptIndex.get(d.id) ?? 0) % 8})` }} />
                  {shortName(d)}
                </span>
              ))
            ) : (
              <span className="text-small text-muted">kein Ressort</span>
            )}
          </Row>
        ))}
      </Group>

      <Group title="Nachrücker" note="Der Pool in seiner Reihenfolge. Sagt jemand ab, rückt Nummer 1 nach." people={result.waiting}>
        {result.waiting.map((p, i) => (
          <Row key={p.id} no={`${i + 1}.`} person={p} />
        ))}
      </Group>

      <Group title="Absage" note="„Nicht aufnehmen“." people={result.rejected}>
        {result.rejected.map((p) => (
          <Row key={p.id} no="" person={p} />
        ))}
      </Group>
    </main>
  );
}

function Group({ title: heading, note, people, children }: { title: string; note: string; people: ResultPerson[]; children: ReactNode }) {
  return (
    <section className={section}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={sectionTitle}>
          {heading} <span className="text-note font-normal text-muted tabular-nums">{people.length}</span>
        </h2>
        {people.length > 0 && <CopyAddresses emails={people.map((p) => p.email)} />}
      </div>
      <p className={lead}>{note}</p>
      <div className={listGroup}>{people.length ? children : <p className="px-4 py-[11px] text-note text-muted">Niemand.</p>}</div>
    </section>
  );
}

function Row({ no, person, children }: { no: string; person: ResultPerson; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-4 py-[11px]">
      <span className="text-note text-muted tabular-nums">{no}</span>
      <span className="min-w-0 text-body font-medium">
        {person.name}
        {person.noShow && <span className="text-small font-medium text-warn"> · nicht erschienen</span>}
      </span>
      <span className="row-span-2 flex flex-col items-end gap-0.5 self-center text-note">{children}</span>
      <span className="col-start-2 text-note break-all text-muted select-all">{person.email}</span>
    </div>
  );
}
