// Overview "/" (Phase 13, PRD 8): where the round stands, numbers, and hints
// for admins (booked slots with a conflicted or deactivated interviewer,
// fewer bookable slots than applicants without one). Member's session.
import type { SupabaseClient } from "@supabase/supabase-js";
import { phaseText } from "@/lib/round-phase";
import { hintContext, loadScheduling } from "@/lib/scheduling";
import { capacity, hintText, slotHints, type Capacity } from "@/lib/scheduling-rules";

export type Overview = {
  title: string;
  phase: { title: string; text: string };
  capacity: Capacity;
  /** Slots needing a new pair; shown to admins only. */
  hints: string[];
  /** Fewer bookable slots than applicants without one. */
  capacityShort: boolean;
};

const when = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

type RoundRow = {
  id: string;
  title: string;
  application_opens_at: string;
  application_closes_at: string;
  interviews_from: string;
  interviews_until: string;
  selection_started_at: string | null;
  board_frozen_at: string | null;
};

/** The newest round (or roundId); null = no round yet. */
export async function loadOverview(session: SupabaseClient, now = new Date(), roundId?: string): Promise<Overview | null> {
  let query = session
    .from("rounds")
    .select(
      "id, title, application_opens_at, application_closes_at, interviews_from, interviews_until, selection_started_at, board_frozen_at",
    );
  if (roundId) query = query.eq("id", roundId);
  const { data: round, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle<RoundRow>();
  if (error) throw new Error(error.message);
  if (!round) return null;

  const data = await loadScheduling(session, round.id);
  const context = hintContext(data);
  const cap = capacity(data.applicants.length, context);
  const memberName = (id: string) => data.members.find((m) => m.id === id)?.name ?? "Unbekannt";
  const applicantName = new Map(data.applicants.map((a) => [a.id, a.name]));

  const hints = data.slots
    .filter((s) => s.applicantId)
    .flatMap((s) =>
      slotHints(s, context)
        .filter((h) => h.kind === "conflict" || h.kind === "inactive")
        .map((h) => `${when.format(new Date(s.startsAt))}, ${applicantName.get(s.applicantId!) ?? ""}: ${hintText(h, memberName)}`),
    );

  return {
    title: round.title,
    phase: phaseText(
      {
        opensAt: new Date(round.application_opens_at),
        closesAt: new Date(round.application_closes_at),
        interviewsFrom: round.interviews_from,
        interviewsUntil: round.interviews_until,
        selectionStartedAt: round.selection_started_at ? new Date(round.selection_started_at) : null,
        boardFrozenAt: round.board_frozen_at ? new Date(round.board_frozen_at) : null,
      },
      now,
    ),
    capacity: cap,
    hints,
    capacityShort: cap.bookable < cap.withoutSlot,
  };
}
