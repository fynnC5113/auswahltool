// Draft Board (Phase 16, Fynn 30.09.2026): pool, seats, "Nicht aufnehmen".
// Opens only after "Auswahlrunde starten" (before, the short scores would
// differ from member to member because of the sight lock).
import { getMember } from "@/lib/auth/member";
import { loadBoard } from "@/lib/board";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../brand";
import { teamPage } from "../../ui";
import { BoardView } from "./board-view";

export default async function BoardPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);
  const board = member ? await loadBoard(supabase) : null;

  if (!member || !board) {
    return (
      <main className={teamPage}>
        <PageHeader heading="Board">Es gibt noch keine Runde.</PageHeader>
      </main>
    );
  }

  if (!board.active && !board.frozen) {
    return (
      <main className={teamPage}>
        <PageHeader heading="Board">
          Das Board öffnet mit der Auswahlrunde. {member.role === "admin" ? "Du startest sie auf der Übersicht." : "Ein Admin startet sie auf der Übersicht."}
        </PageHeader>
      </main>
    );
  }

  return <BoardView initial={board} isAdmin={member.role === "admin"} memberId={member.id} />;
}
