"use server";

// Board actions (Phase 16, undo and freezing Phase 17). The member's session; the database functions
// check every rule again. Each action returns the fresh board, so the page
// shows the stored state after every change (also after a rejected one).
import { freezeBoard, loadBoard, moveCard, setBoardDepartments, setSeats, undoEvent, unfreezeBoard, type Board, type BoardResult } from "@/lib/board";
import type { Zone } from "@/lib/board-rules";
import { createClient } from "@/lib/supabase/server";

export type BoardActionResult = { board: Board | null; error: string };

async function after(roundId: string, result: BoardResult): Promise<BoardActionResult> {
  const board = await loadBoard(await createClient(), roundId);
  return { board, error: "error" in result ? result.error : "" };
}

export async function moveCardAction(
  roundId: string,
  applicantId: string,
  zone: Zone,
  position: number | null,
  pool: string[],
): Promise<BoardActionResult> {
  return after(roundId, await moveCard(await createClient(), applicantId, zone, position, pool));
}

export async function setSeatsAction(roundId: string, delta: 1 | -1): Promise<BoardActionResult> {
  return after(roundId, await setSeats(await createClient(), roundId, delta));
}

export async function setDepartmentsAction(roundId: string, applicantId: string, departmentIds: string[]): Promise<BoardActionResult> {
  return after(roundId, await setBoardDepartments(await createClient(), applicantId, departmentIds));
}

export async function undoAction(roundId: string, eventId: string, pool: string[]): Promise<BoardActionResult> {
  return after(roundId, await undoEvent(await createClient(), eventId, pool));
}

export async function freezeAction(roundId: string): Promise<BoardActionResult> {
  return after(roundId, await freezeBoard(await createClient(), roundId));
}

export async function unfreezeAction(roundId: string): Promise<BoardActionResult> {
  return after(roundId, await unfreezeBoard(await createClient(), roundId));
}

/** Reload without a change ("Neu laden" after a conflict). */
export async function reloadBoardAction(roundId: string): Promise<BoardActionResult> {
  return { board: await loadBoard(await createClient(), roundId), error: "" };
}
