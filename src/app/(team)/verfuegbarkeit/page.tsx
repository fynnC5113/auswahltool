import { getMember } from "@/lib/auth/member";
import { blockedIn, dayCells, gridDays } from "@/lib/availability-grid";
import { loadBlockedTimes, loadMyAvailability, loadPlanningRound } from "@/lib/availability";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../brand";
import { teamPage } from "../../ui";
import { AvailabilityGrid, type GridDay } from "./availability-grid";

const dayLabel = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

export default async function AvailabilityPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);
  const round = member ? await loadPlanningRound(supabase) : null;

  if (!member || !round) {
    return (
      <main className={teamPage}>
        <PageHeader heading="Meine Verfügbarkeit">Es gibt noch keine Runde.</PageHeader>
      </main>
    );
  }

  const [mine, blocked] = await Promise.all([
    loadMyAvailability(supabase, round.id, member.id),
    loadBlockedTimes(supabase, round.id),
  ]);

  const days: GridDay[] = gridDays(round.interviewsFrom, round.interviewsUntil).map((day) => ({
    day,
    label: dayLabel.format(new Date(`${day}T00:00:00Z`)),
    cells: dayCells(day).map((cell) => ({
      start: cell.start,
      label: cell.label,
      blocked: blockedIn(cell, blocked).map((b) => (b.note ? `${b.location}: ${b.note}` : `${b.location} belegt`)),
    })),
  }));

  return (
    <main className={teamPage}>
      <PageHeader heading="Meine Verfügbarkeit">
        Markiere, wann du Gespräche führen kannst. Ein Feld sind 15 Minuten. Schraffiert: Der Raum ist belegt; du kannst das Feld
        trotzdem markieren, falls ein anderer Raum frei ist.
      </PageHeader>
      <AvailabilityGrid
        roundId={round.id}
        days={days}
        initialStarts={mine.starts}
        initialMax={mine.maxInterviews === null ? "" : String(mine.maxInterviews)}
      />
    </main>
  );
}
