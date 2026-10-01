"use client";

// Draft Board (Phase 16, Fynn 30.09.2026, preview "Board-Vorschau Phase 16",
// version 3; live, history and freezing Phase 17, preview "Board live –
// Phase 17", notice variant A). Laptop: three columns, drag with mouse or keyboard (dnd kit),
// a click opens the details on the right. Phone: zones one below the other,
// a tap opens "Verschieben nach …". Beamer mode: the same board without the
// menu and larger. Every change goes through a server action that returns
// the stored board; the rules are checked in the browser first (board-rules)
// so a taken seat is rejected at once. Changes by others arrive over
// Realtime (a new board_events row), then the board reloads and a line at the
// bottom says who moved what where.
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { boardResult, shortName, type Board, type BoardCard, type HistoryItem } from "@/lib/board";
import {
  NONE,
  boardState,
  changeSeats,
  composition,
  formatShortScore,
  moveCard,
  poolOrder,
  toggleDepartment,
  undoBlock,
  type Target,
  type UndoBlock,
} from "@/lib/board-rules";
import { createClient } from "@/lib/supabase/client";
import {
  button,
  dialog as dialogClass,
  dialogBody,
  lead,
  readLabel,
  secondaryButton,
  sectionTitle,
  smallButton,
  textButton,
  title,
} from "../../ui";
import {
  freezeAction,
  moveCardAction,
  reloadBoardAction,
  setDepartmentsAction,
  setSeatsAction,
  undoAction,
  unfreezeAction,
  type BoardActionResult,
} from "./actions";

const WIDE = "(min-width: 1024px)";

/** Laptop layout (drag and drop) from lg; below, the phone layout (tap). */
function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

type Toast = { text: string; error: boolean };
type Popover = { id: string; x: number; y: number };

/** Department colour by its place in the round (DESIGN.md, tokens --c-dept-0 … 7). */
const deptColor = (index: number) => ({ background: `var(--c-dept-${index % 8})` });

function Dot({ index }: { index: number }) {
  return <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={deptColor(index)} />;
}

export function BoardView({ initial, isAdmin, memberId }: { initial: Board; isAdmin: boolean; memberId: string }) {
  const [board, setBoard] = useState(initial);
  const [history, setHistory] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [present, setPresent] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const wide = useWide();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const freezeDialog = useRef<HTMLDialogElement>(null);
  const unfreezeDialog = useRef<HTMLDialogElement>(null);

  /**
   * A board from the server. The history only grows, so an answer that
   * arrives late (shorter history) never replaces a newer one.
   */
  function accept(next: Board) {
    setBoard((current) => (next.history.length >= current.history.length ? next : current));
  }

  const cards = useMemo(() => new Map(board.cards.map((c) => [c.id, c])), [board.cards]);
  const state = useMemo(() => boardState(board.cards.map((c) => c.id), board.placements), [board.cards, board.placements]);
  const pool = useMemo(
    () => poolOrder(state, (id) => ({ score: cards.get(id)?.score ?? null, name: cards.get(id)?.name ?? "" })),
    [state, cards],
  );
  const seatOf = useMemo(() => new Map(state.filter((p) => p.zone === "seat").map((p) => [p.position!, p.applicantId])), [state]);
  const rejected = useMemo(
    () =>
      state
        .filter((p) => p.zone === "reject")
        .map((p) => p.applicantId)
        .sort((a, b) => (cards.get(a)?.name ?? "").localeCompare(cards.get(b)?.name ?? "", "de")),
    [state, cards],
  );
  const deptIndex = useMemo(() => new Map(board.departments.map((d, i) => [d.id, i])), [board.departments]);
  const editable = board.active;
  const zoneOf = (id: string) => state.find((p) => p.applicantId === id);

  function showToast(text: string, error = false) {
    setToast({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Live: every new history entry of this round (RLS: members only) reloads
  // the board. Changes by others get a line at the bottom. After a lost
  // connection or when the page becomes visible again, reload once.
  const roundId = board.roundId;
  useEffect(() => {
    const supabase = createClient();
    const fromOthers = new Set<string>();
    let busy = false;
    let again = false;
    let subscribed = false;
    let closed = false;

    async function reload() {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        do {
          again = false;
          const result = await reloadBoardAction(roundId);
          if (closed || !result.board) continue;
          accept(result.board);
          const last = result.board.history.filter((e) => fromOthers.has(e.id)).at(-1);
          fromOthers.clear();
          if (last) showToast(`${firstName(last.actorName)}: ${last.undoes ? "Rückgängig, " : ""}${describeEvent(last, result.board)}`);
        } while (again && !closed);
      } catch {
        // The next change or the next visit to the page tries again.
      } finally {
        busy = false;
      }
    }

    const channel = supabase
      .channel(`board:${roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_events", filter: `round_id=eq.${roundId}` },
        (payload) => {
          const row = payload.new as { id: string; actor_id: string | null };
          if (row.actor_id !== memberId) fromOthers.add(row.id);
          void reload();
        },
      );
    // Realtime checks the rights once, when the channel joins. Without the
    // member's token first, it joins as anon and the filter is rejected
    // ("invalid column for filter round_id", 01.10.2026).
    void supabase.realtime.setAuth().then(() => {
      if (closed) return;
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (subscribed) void reload();
        subscribed = true;
      });
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [roundId, memberId]);
  useEffect(() => {
    if (!popover) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setPopover(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [popover]);

  /** Sends a change; shows the stored board afterwards, or the old one if the request failed. */
  function send(before: Board, request: () => Promise<BoardActionResult>, done?: string) {
    startTransition(async () => {
      try {
        const result = await request();
        if (result.board) accept(result.board);
        if (result.error) showToast(result.error, true);
        else if (done) showToast(done);
      } catch {
        setBoard(before);
        showToast("Nicht gespeichert. Bitte prüfe die Verbindung und lade die Seite neu.", true);
      }
    });
  }

  function move(id: string, target: Target, announce = false) {
    if (!editable) return;
    const r = moveCard(state, board.seats, id, target, pool);
    if (!r.ok) {
      if (r.error === "seat_taken") showToast(`Platz ${r.position} ist belegt. Nimm einen freien Platz.`, true);
      else if (r.error !== "unchanged") showToast("Das Board hat sich inzwischen geändert. Bitte lade die Seite neu.", true);
      return;
    }
    const before = board;
    setBoard({ ...board, placements: r.state });
    const name = cards.get(id)?.name ?? "";
    const where =
      target.zone === "seat" ? `auf Platz ${r.move.toPosition}` : target.zone === "pool" ? `im Pool an Stelle ${r.move.toPosition}` : "bei „Nicht aufnehmen“";
    send(before, () => moveCardAction(board.roundId, id, target.zone, r.move.toPosition, pool), announce ? `${name} liegt jetzt ${where}.` : undefined);
  }

  function changeSeatCount(delta: 1 | -1) {
    const r = changeSeats(state, board.seats, delta);
    if (!r.ok) {
      showToast(r.error === "minimum" ? "Mindestens ein Platz bleibt." : `Platz ${r.position} ist belegt. Nur ein leerer letzter Platz lässt sich wegnehmen.`, true);
      return;
    }
    const before = board;
    setBoard({ ...board, seats: r.seats });
    send(before, () => setSeatsAction(board.roundId, delta));
  }

  function toggleDept(id: string, departmentId: string) {
    const r = toggleDepartment(board.assigned[id] ?? [], departmentId);
    if (!r.ok) {
      showToast("Höchstens zwei Ressorts pro Person.", true);
      return;
    }
    const before = board;
    const ids = [...r.ids].sort((a, b) => (deptIndex.get(a) ?? 0) - (deptIndex.get(b) ?? 0));
    setBoard({ ...board, assigned: { ...board.assigned, [id]: ids } });
    send(before, () => setDepartmentsAction(board.roundId, id, ids));
  }

  function undo(eventId: string) {
    send(board, () => undoAction(board.roundId, eventId, pool), "Rückgängig gemacht.");
  }

  function freeze() {
    freezeDialog.current?.close();
    send(board, () => freezeAction(board.roundId), "Board eingefroren. Das Ergebnis steht fest.");
  }

  function unfreeze() {
    unfreezeDialog.current?.close();
    send(board, () => unfreezeAction(board.roundId), "Einfrieren aufgehoben. Das Board lässt sich wieder ändern.");
  }

  function openHistory() {
    setSelected(null);
    setSheet(null);
    setHistory(!history);
  }

  function togglePresent() {
    const next = !present;
    setPresent(next);
    setSelected(null);
    setPopover(null);
    // Fullscreen is optional (not every browser allows it).
    if (next) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // ----- drag and drop -----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const detect: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    if (hits.length) return [hits.find((h) => cards.has(String(h.id))) ?? hits[0]];
    return closestCenter(args);
  };
  const nameOf = (id: UniqueIdentifier) => cards.get(String(id))?.name ?? "Karte";
  const targetLabel = (id: UniqueIdentifier) => {
    const t = String(id);
    if (t.startsWith("seat-")) return `Platz ${t.slice(5)}`;
    if (t === "reject") return "Nicht aufnehmen";
    if (t === "pool") return "Pool, am Ende";
    return `Pool, vor ${nameOf(t)}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)} aufgenommen.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} über ${targetLabel(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} abgelegt: ${targetLabel(over.id)}.` : `${nameOf(active.id)} bleibt, wo sie war.`),
    onDragCancel: ({ active }) => `Abgebrochen. ${nameOf(active.id)} bleibt, wo sie war.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    if (!over) return;
    const id = String(active.id);
    const t = String(over.id);
    if (t.startsWith("seat-")) return move(id, { zone: "seat", position: Number(t.slice(5)) });
    if (t === "reject") return move(id, { zone: "reject" });
    if (t === "pool") return move(id, { zone: "pool" });
    const index = pool.indexOf(t);
    if (index >= 0) move(id, { zone: "pool", position: index + 1 });
  }

  // ----- pieces -----
  const cardProps = (id: string) => ({
    card: cards.get(id)!,
    onSeat: zoneOf(id)?.zone === "seat",
    assigned: board.assigned[id] ?? [],
    board,
    deptIndex,
    present,
    editable,
    selected: selected === id,
    onOpen: () => (setHistory(false), wide ? setSelected(selected === id ? null : id) : setSheet(id)),
    onAssign: (x: number, y: number) => setPopover(popover?.id === id ? null : { id, x, y }),
  });

  const bar = composition(
    state,
    board.seats,
    board.cards.map((c) => ({ applicantId: c.id, cohort: c.cohort })),
    new Map(Object.entries(board.assigned)),
    board.departments.map((d) => d.id),
  );

  const summary = (
    <p className={`flex flex-wrap items-baseline gap-x-5 gap-y-1 ${present ? "text-body" : "text-small"} text-muted`}>
      {bar.departments.map((d) =>
        d.key === NONE ? (
          <span key={d.key} className="whitespace-nowrap">
            ohne Ressort <b className="font-semibold text-fg tabular-nums">{d.count}</b>
          </span>
        ) : (
          <span key={d.key} className={`inline-flex items-center gap-1.5 whitespace-nowrap ${d.count ? "" : "opacity-60"}`}>
            <Dot index={deptIndex.get(d.key) ?? 0} />
            {shortName(board.departments[deptIndex.get(d.key) ?? 0])} <b className="font-semibold text-fg tabular-nums">{d.count}</b>
          </span>
        ),
      )}
      {bar.cohorts.length > 0 && (
        <span className="whitespace-nowrap">
          Jahrgang{" "}
          {bar.cohorts.map((c, i) => (
            <span key={c.cohort}>
              {i > 0 && " · "}
              {c.cohort} <b className="font-semibold text-fg tabular-nums">{c.count}</b>
            </span>
          ))}
        </span>
      )}
    </p>
  );

  const stepper = isAdmin && editable && (
    <span className="inline-flex items-center gap-0.5">
      <button type="button" onClick={() => changeSeatCount(-1)} aria-label="Einen Platz weniger" className="size-10 rounded-field text-section text-accent hover:bg-field">
        −
      </button>
      <span className="min-w-[4.5rem] text-center text-note tabular-nums">{board.seats} Plätze</span>
      <button type="button" onClick={() => changeSeatCount(1)} aria-label="Einen Platz mehr" className="size-10 rounded-field text-section text-accent hover:bg-field">
        +
      </button>
    </span>
  );

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className={title}>Board</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {stepper}
          <button type="button" onClick={openHistory} className={textButton}>
            Verlauf
          </button>
          {wide && (
            <button type="button" onClick={togglePresent} className={textButton}>
              {present ? "Beamer-Modus beenden" : "Beamer-Modus"}
            </button>
          )}
          {isAdmin && editable && (
            <button type="button" onClick={() => freezeDialog.current?.showModal()} className={textButton}>
              Einfrieren
            </button>
          )}
        </div>
      </div>
      {board.frozen && (
        <div role="status" className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-field bg-accent-soft px-4 py-2.5 ${present ? "text-body" : "text-note"}`}>
          <span className="min-w-[14rem] flex-1">
            <b className="font-semibold">Eingefroren</b>
            {board.frozenAt && ` am ${formatDay(board.frozenAt)} um ${formatTime(board.frozenAt)}`}
            {board.frozenBy && ` von ${board.frozenBy}`}. Das Ergebnis steht fest, nichts lässt sich mehr verschieben.
          </span>
          <Link href="/board/ergebnis" className={textButton}>
            Ergebnis ansehen
          </Link>
          {isAdmin && (
            <button type="button" onClick={() => unfreezeDialog.current?.showModal()} className={textButton}>
              Einfrieren aufheben
            </button>
          )}
        </div>
      )}
      {summary}
    </div>
  );

  const seatNumbers = Array.from({ length: board.seats }, (_, i) => i + 1);

  const result = boardResult(board);
  const dialogs = (
    <>
      <dialog ref={freezeDialog} aria-label="Board einfrieren" className={dialogClass}>
        <div className={dialogBody}>
          <h2 className={sectionTitle}>Board einfrieren?</h2>
          <p className={lead}>
            Danach kann niemand mehr etwas verschieben, Ressorts ändern oder Feedback bearbeiten. Das Ergebnis erscheint unter
            „Ergebnis“. Ein Admin kann das Einfrieren wieder aufheben.
          </p>
          <p className={lead}>
            {result.accepted.length} {result.accepted.length === 1 ? "Zusage" : "Zusagen"}
            {bar.filled < board.seats && ` (${board.seats - bar.filled} ${board.seats - bar.filled === 1 ? "Platz" : "Plätze"} frei)`},{" "}
            {result.waiting.length} Nachrücker, {result.rejected.length} {result.rejected.length === 1 ? "Absage" : "Absagen"}.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={freeze} className={button}>
              Einfrieren
            </button>
            <button type="button" onClick={() => freezeDialog.current?.close()} className={secondaryButton}>
              Abbrechen
            </button>
          </div>
        </div>
      </dialog>
      <dialog ref={unfreezeDialog} aria-label="Einfrieren aufheben" className={dialogClass}>
        <div className={dialogBody}>
          <h2 className={sectionTitle}>Einfrieren aufheben?</h2>
          <p className={lead}>Das Board lässt sich danach wieder ändern, das Ergebnis gilt nicht mehr als fest. Alle sehen das sofort.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={unfreeze} className={button}>
              Einfrieren aufheben
            </button>
            <button type="button" onClick={() => unfreezeDialog.current?.close()} className={secondaryButton}>
              Abbrechen
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
  const historyList = (
    <HistoryList
      board={board}
      state={state}
      isAdmin={isAdmin}
      memberId={memberId}
      editable={editable}
      large={present}
      onUndo={undo}
    />
  );

  // ----- phone -----
  if (!wide) {
    const jump = (zone: string) => document.getElementById(`zone-${zone}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return (
      <main className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-4 pt-6 pb-10">
        {header}
        <nav className="sticky top-0 z-10 -my-2 flex gap-1.5 bg-bg py-2" aria-label="Zu einer Zone springen">
          {[
            ["seat", "Plätze"],
            ["pool", "Pool"],
            ["reject", "Nicht aufnehmen"],
          ].map(([zone, label]) => (
            <button key={zone} type="button" onClick={() => jump(zone)} className="rounded-full bg-surface px-3 py-1.5 text-small font-medium text-accent">
              {label}
            </button>
          ))}
        </nav>
        <PhoneZone id="seat" title="Plätze" count={`${bar.filled} von ${board.seats}`} tone="bg-ok-soft">
          {seatNumbers.map((n) => (
            <div key={n} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-right text-small text-muted tabular-nums">{n}</span>
              {seatOf.get(n) ? <CardView {...cardProps(seatOf.get(n)!)} /> : <EmptySeat />}
            </div>
          ))}
        </PhoneZone>
        <PhoneZone id="pool" title="Pool" count={`${pool.length}`} tone="bg-field">
          {pool.map((id) => (
            <CardView key={id} {...cardProps(id)} />
          ))}
        </PhoneZone>
        <PhoneZone id="reject" title="Nicht aufnehmen" count={`${rejected.length}`} tone="bg-danger-soft">
          {rejected.map((id) => (
            <CardView key={id} {...cardProps(id)} dim />
          ))}
        </PhoneZone>

        {sheet && (
          <Sheet onClose={() => setSheet(null)} label={cards.get(sheet)?.name ?? ""}>
            <SheetHead card={cards.get(sheet)!} board={board} onDetails={() => (setSelected(sheet), setSheet(null))} />
            {editable && (
              <MovePanel
                id={sheet}
                board={board}
                zone={zoneOf(sheet)!}
                pool={pool}
                seatOf={seatOf}
                deptIndex={deptIndex}
                onMove={(target) => (move(sheet, target, true), setSheet(null))}
                onToggleDept={(d) => toggleDept(sheet, d)}
              />
            )}
            <button type="button" onClick={() => setSheet(null)} className={`${textButton} min-h-11 self-center`}>
              Schließen
            </button>
          </Sheet>
        )}
        {history && (
          <Sheet onClose={() => setHistory(false)} label="Verlauf">
            {historyList}
            <button type="button" onClick={() => setHistory(false)} className={`${textButton} min-h-11 self-center`}>
              Schließen
            </button>
          </Sheet>
        )}
        {dialogs}
        {selected && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-surface pb-[env(safe-area-inset-bottom)]">
            <div className="px-4 pt-4">
              <button type="button" onClick={() => setSelected(null)} className={`${textButton} min-h-11`}>
                ‹ Board
              </button>
            </div>
            <Detail card={cards.get(selected)!} board={board} zone={zoneOf(selected)!} deptIndex={deptIndex} />
          </div>
        )}
        {toast && <ToastView toast={toast} />}
      </main>
    );
  }

  // ----- laptop and beamer -----
  const cols = present ? "grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,260px)]" : "grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,240px)]";
  return (
    <main
      className={
        present
          ? "fixed inset-0 z-50 flex flex-col gap-5 overflow-hidden bg-bg px-9 pt-7 pb-6"
          : "mx-auto flex h-[calc(100dvh-65px)] w-full max-w-[1600px] flex-col gap-4 px-6 pt-6 pb-6"
      }
    >
      {header}
      <DndContext
        sensors={sensors}
        collisionDetection={detect}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: "Leertaste nimmt die Karte auf, Pfeiltasten bewegen sie, Leertaste legt sie ab, Escape bricht ab.",
          },
        }}
        onDragStart={({ active }) => (setDragging(String(active.id)), setPopover(null))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className={`grid min-h-0 flex-1 gap-5 ${cols}`}>
          <Column title="Pool" count={`${pool.length}`}>
            <DropZone id="pool" className="bg-field" disabled={!editable}>
              <SortableContext items={pool} strategy={verticalListSortingStrategy}>
                {pool.map((id) => (
                  <SortableCard key={id} id={id} disabled={!editable}>
                    <CardView {...cardProps(id)} faded={dragging === id} />
                  </SortableCard>
                ))}
              </SortableContext>
            </DropZone>
          </Column>

          <Column title="Plätze" count={`${bar.filled} von ${board.seats}`}>
            <div className={`grid min-h-0 flex-1 auto-rows-min gap-2.5 overflow-y-auto rounded-group bg-ok-soft p-2.5 ${present ? "grid-cols-3" : "grid-cols-2"}`}>
              {seatNumbers.map((n) => (
                <SeatBox key={n} n={n} disabled={!editable}>
                  {seatOf.get(n) ? (
                    <DraggableCard id={seatOf.get(n)!} disabled={!editable}>
                      <CardView {...cardProps(seatOf.get(n)!)} faded={dragging === seatOf.get(n)} seat={n} />
                    </DraggableCard>
                  ) : (
                    <EmptySeat n={n} tall />
                  )}
                </SeatBox>
              ))}
            </div>
          </Column>

          <Column title="Nicht aufnehmen" count={`${rejected.length}`}>
            <DropZone id="reject" className="bg-danger-soft" disabled={!editable}>
              {rejected.map((id) => (
                <DraggableCard key={id} id={id} disabled={!editable}>
                  <CardView {...cardProps(id)} faded={dragging === id} dim />
                </DraggableCard>
              ))}
            </DropZone>
          </Column>
        </div>
        <DragOverlay dropAnimation={null}>{dragging && cards.has(dragging) ? <CardView {...cardProps(dragging)} lifted /> : null}</DragOverlay>
      </DndContext>

      {history && (
        <aside className="fixed inset-y-0 right-0 z-[60] flex w-[min(440px,100vw)] flex-col bg-surface shadow-[-12px_0_40px_rgba(0,0,0,0.18)]" aria-label="Verlauf">
          <div className="flex justify-end px-5 pt-4">
            <button type="button" onClick={() => setHistory(false)} className={`${textButton} min-h-11`}>
              Schließen
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">{historyList}</div>
        </aside>
      )}
      {dialogs}
      {selected && cards.has(selected) && (
        <aside className="fixed inset-y-0 right-0 z-[60] flex w-[min(440px,100vw)] flex-col bg-surface shadow-[-12px_0_40px_rgba(0,0,0,0.18)]" aria-label="Details">
          <div className="flex justify-end px-5 pt-4">
            <button type="button" onClick={() => setSelected(null)} className={`${textButton} min-h-11`}>
              Schließen
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Detail card={cards.get(selected)!} board={board} zone={zoneOf(selected)!} deptIndex={deptIndex} large={present}>
              {editable && (
                <MovePanel
                  id={selected}
                  board={board}
                  zone={zoneOf(selected)!}
                  pool={pool}
                  seatOf={seatOf}
                  deptIndex={deptIndex}
                  onMove={(target) => move(selected, target, true)}
                  onToggleDept={(d) => toggleDept(selected, d)}
                />
              )}
            </Detail>
          </div>
        </aside>
      )}

      {popover && cards.has(popover.id) && (
        <DeptPopover
          popover={popover}
          card={cards.get(popover.id)!}
          board={board}
          deptIndex={deptIndex}
          onToggle={(d) => toggleDept(popover.id, d)}
          onClose={() => setPopover(null)}
        />
      )}
      {toast && <ToastView toast={toast} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function wishText(card: BoardCard, board: Board): string {
  if (card.wishAll) return "alle Ressorts";
  if (!card.wish.length) return "keine Angabe";
  const first = board.departments.find((d) => d.id === card.wish[0]);
  return (first ? shortName(first) : "") + (card.wish.length > 1 ? ` +${card.wish.length - 1}` : "");
}

function CardView({
  card,
  onSeat,
  assigned,
  board,
  deptIndex,
  present,
  editable,
  selected,
  onOpen,
  onAssign,
  faded,
  lifted,
  dim,
  seat,
}: {
  card: BoardCard;
  onSeat: boolean;
  assigned: string[];
  board: Board;
  deptIndex: Map<string, number>;
  present: boolean;
  editable: boolean;
  selected: boolean;
  onOpen: () => void;
  onAssign: (x: number, y: number) => void;
  faded?: boolean;
  lifted?: boolean;
  dim?: boolean;
  seat?: number;
}) {
  const depts = assigned.map((id) => board.departments[deptIndex.get(id) ?? -1]).filter(Boolean);
  return (
    <div
      className={`relative flex w-full min-w-0 flex-col gap-0.5 rounded-field bg-surface px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--c-line)] ${
        selected ? "shadow-[inset_0_0_0_2px_var(--c-accent)]" : ""
      } ${faded ? "opacity-35" : ""} ${dim && !selected ? "opacity-75" : ""} ${lifted ? "shadow-[0_12px_30px_rgba(0,0,0,0.2)]" : ""} ${
        seat ? "min-h-[5.5rem]" : ""
      }`}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className={`min-w-0 truncate text-left font-semibold ${present ? "text-section" : "text-note"} after:absolute after:inset-0 after:content-['']`}
        >
          {card.name}
        </button>
        {seat ? (
          <span className={`shrink-0 text-muted tabular-nums ${present ? "text-note" : "text-small"}`}>{seat}</span>
        ) : onSeat ? null : (
          <span className={`shrink-0 text-muted tabular-nums ${present ? "text-body" : "text-note"}`} title="Kurzbewertung">
            {formatShortScore(card.score)}
          </span>
        )}
      </div>
      <span className={`truncate text-muted ${present ? "text-note" : "text-small"}`}>
        {card.cohort} · {onSeat ? "Wunsch: " : ""}
        {wishText(card, board)}
      </span>
      {card.noShow && <span className={`font-medium text-warn ${present ? "text-note" : "text-small"}`}>nicht erschienen</span>}
      {onSeat && (
        <div className="flex min-w-0 items-end justify-between gap-2 pt-1">
          {editable ? (
            <button
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onAssign(r.left, r.bottom + 4);
              }}
              className={`relative z-10 -ml-2 flex min-w-0 items-center gap-1.5 rounded-check px-2 py-1 font-medium hover:bg-field ${
                present ? "text-note" : "text-small"
              } ${depts.length ? "text-fg" : "text-accent"}`}
            >
              <DeptList depts={depts} deptIndex={deptIndex} empty="Ressort wählen" />
              <span aria-hidden="true" className="text-muted">
                ▾
              </span>
            </button>
          ) : (
            <span className={`flex min-w-0 items-center gap-1.5 ${present ? "text-note" : "text-small"}`}>
              <DeptList depts={depts} deptIndex={deptIndex} empty="ohne Ressort" />
            </span>
          )}
          <span className={`shrink-0 text-muted tabular-nums ${present ? "text-body" : "text-note"}`} title="Kurzbewertung">
            {formatShortScore(card.score)}
          </span>
        </div>
      )}
    </div>
  );
}

function DeptList({ depts, deptIndex, empty }: { depts: { id: string; name: string; short: string }[]; deptIndex: Map<string, number>; empty: string }) {
  if (!depts.length) return <span className="truncate">{empty}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {depts.map((d) => (
        <span key={d.id} className="inline-flex min-w-0 items-center gap-1.5">
          <Dot index={deptIndex.get(d.id) ?? 0} />
          <span className="truncate">{shortName(d)}</span>
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Drag and drop wrappers
// ---------------------------------------------------------------------------

const dragAttributes = { role: "group", roleDescription: "verschiebbare Karte" };

function SortableCard({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id, disabled, attributes: dragAttributes });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ transform: CSS.Translate.toString(transform), transition }} className="rounded-field">
      {children}
    </div>
  );
}

function DraggableCard({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id, disabled, attributes: dragAttributes });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className="w-full rounded-field">
      {children}
    </div>
  );
}

function DropZone({ id, className, disabled, children }: { id: string; className: string; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-group p-2 ${className} ${isOver ? "outline-2 outline-offset-2 outline-accent outline-dashed" : ""}`}
    >
      {children}
    </div>
  );
}

function SeatBox({ n, disabled, children }: { n: number; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `seat-${n}`, disabled });
  return (
    <div ref={setNodeRef} className={`flex min-w-0 rounded-field ${isOver ? "outline-2 outline-offset-2 outline-accent outline-dashed" : ""}`}>
      {children}
    </div>
  );
}

function EmptySeat({ n, tall }: { n?: number; tall?: boolean }) {
  return (
    <div
      className={`flex w-full items-start justify-between rounded-field border-[1.5px] border-dashed border-line px-3 py-2.5 text-small text-muted ${
        tall ? "min-h-[5.5rem]" : "min-h-11 items-center"
      }`}
    >
      <span>frei</span>
      {n && <span className="tabular-nums">{n}</span>}
    </div>
  );
}

function Column({ title: heading, count, children }: { title: string; count: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2">
      <h2 className="text-body font-semibold">
        {heading} <span className="font-normal text-muted tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function PhoneZone({ id, title: heading, count, tone, children }: { id: string; title: string; count: string; tone: string; children: ReactNode }) {
  return (
    <section id={`zone-${id}`} className="flex scroll-mt-14 flex-col gap-2">
      <h2 className="text-section font-semibold">
        {heading} <span className="text-note font-normal text-muted tabular-nums">{count}</span>
      </h2>
      <div className={`flex flex-col gap-2 rounded-group p-2 ${tone}`}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Details, moving without dragging, departments
// ---------------------------------------------------------------------------

function Detail({
  card,
  board,
  zone,
  deptIndex,
  large,
  children,
}: {
  card: BoardCard;
  board: Board;
  zone: { zone: string; position: number | null };
  deptIndex: Map<string, number>;
  large?: boolean;
  children?: ReactNode;
}) {
  const assigned = (board.assigned[card.id] ?? []).map((id) => board.departments[deptIndex.get(id) ?? -1]).filter(Boolean);
  const wish = card.wishAll ? "für alle Ressorts offen" : card.wish.map((id) => board.departments.find((d) => d.id === id)?.name ?? "").join(", ") || "keine Angabe";
  const where = zone.zone === "seat" ? `Platz ${zone.position}` : zone.zone === "reject" ? "Nicht aufnehmen" : "Pool";
  const text = large ? "text-body" : "text-note";
  return (
    <div className="flex flex-col gap-6 px-5 pt-2 pb-8">
      <div className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">{card.name}</h2>
        <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 ${text}`}>
          <dt className="text-muted">Stand</dt>
          <dd>
            {where}
            {card.noShow && <span className="text-warn"> · nicht erschienen</span>}
          </dd>
          {zone.zone === "seat" && (
            <>
              <dt className="text-muted">Ressort</dt>
              <dd className="flex min-w-0 items-center gap-2">
                {assigned.length ? <DeptList depts={assigned} deptIndex={deptIndex} empty="" /> : <span className="text-muted">noch keins</span>}
              </dd>
            </>
          )}
          <dt className="text-muted">Wunsch</dt>
          <dd>{wish}</dd>
          <dt className="text-muted">Jahrgang</dt>
          <dd>{card.cohort}</dd>
          <dt className="text-muted">Kurzbewertung</dt>
          <dd className="tabular-nums">
            {formatShortScore(card.score)}{" "}
            <span className="text-small text-muted">
              aus {card.feedback.length} {card.feedback.length === 1 ? "Feedback" : "Feedbacks"}
            </span>
          </dd>
          {card.interviewers.length > 0 && (
            <>
              <dt className="text-muted">Gespräch</dt>
              <dd>{card.interviewers.join(" und ")}</dd>
            </>
          )}
        </dl>
      </div>

      {children}

      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">Feedback</h3>
        {card.feedback.length === 0 && <p className={`${text} text-muted`}>Noch kein abgegebenes Feedback.</p>}
        {card.feedback.map((f) => (
          <div key={f.name} className="flex flex-col gap-2 border-t border-line pt-3">
            <p className="font-semibold">{f.name}</p>
            {board.criteria.map((c, i) => (
              <div key={c.id}>
                <p className={`flex items-baseline justify-between gap-3 ${text}`}>
                  <span>{c.name}</span>
                  <span className="font-semibold tabular-nums">
                    {f.scores[i]?.score ?? "–"} <span className="text-small font-normal text-muted">/ {c.scaleMax}</span>
                  </span>
                </p>
                {f.scores[i]?.text && <p className={`${large ? "text-note" : "text-small"} whitespace-pre-wrap text-muted`}>{f.scores[i].text}</p>}
              </div>
            ))}
            <div>
              <p className={readLabel}>Gesamteindruck</p>
              <p className={`${text} whitespace-pre-wrap`}>{f.overall || "–"}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">Antworten</h3>
        {card.answers.map((a, i) => (
          <div key={i}>
            <p className={readLabel}>{a.question}</p>
            <p className={`${text} whitespace-pre-wrap`}>{a.text || "–"}</p>
          </div>
        ))}
        {card.hasCv && (
          <a href={`/bewerbungen/${card.id}/lebenslauf`} target="_blank" rel="noreferrer" className={`${textButton} self-start`}>
            Lebenslauf öffnen
          </a>
        )}
      </section>
    </div>
  );
}

function MovePanel({
  id,
  board,
  zone,
  pool,
  seatOf,
  deptIndex,
  onMove,
  onToggleDept,
}: {
  id: string;
  board: Board;
  zone: { zone: string; position: number | null };
  pool: string[];
  seatOf: Map<number, string>;
  deptIndex: Map<string, number>;
  onMove: (target: Target) => void;
  onToggleDept: (departmentId: string) => void;
}) {
  const place = pool.indexOf(id) + 1;
  const assigned = board.assigned[id] ?? [];
  const card = board.cards.find((c) => c.id === id);
  const order = [...(card?.wish ?? []), ...board.departments.map((d) => d.id).filter((d) => !card?.wish.includes(d))];
  return (
    <section className="flex flex-col gap-4 rounded-group bg-field p-4">
      <h3 className="text-body font-semibold">Verschieben</h3>
      {zone.zone === "seat" && board.departments.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={readLabel}>Ressort (höchstens zwei)</p>
          <div className="flex flex-wrap gap-2">
            {order.map((d) => {
              const on = assigned.includes(d);
              const dept = board.departments[deptIndex.get(d) ?? 0];
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleDept(d)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-button px-3 text-note font-medium ${on ? "bg-accent text-on-accent" : "bg-surface text-fg"}`}
                >
                  <Dot index={deptIndex.get(d) ?? 0} />
                  {shortName(dept)}
                  {card?.wish.includes(d) && !on && <span className="text-small font-normal text-muted">Wunsch</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className={readLabel}>{zone.zone === "seat" ? "Anderer Platz" : "Auf einen Platz"}</p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: board.seats }, (_, i) => i + 1).map((n) => {
            const here = zone.zone === "seat" && zone.position === n;
            const taken = seatOf.has(n) && !here;
            return (
              <button
                key={n}
                type="button"
                disabled={taken || here}
                onClick={() => onMove({ zone: "seat", position: n })}
                aria-label={`Platz ${n}${here ? ", hier" : taken ? ", belegt" : ""}`}
                className={`h-11 rounded-field text-note font-medium tabular-nums ${
                  here ? "bg-accent text-on-accent" : taken ? "bg-surface text-muted line-through opacity-50" : "bg-surface text-accent"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {zone.zone === "pool" ? (
          <>
            <button type="button" disabled={place <= 1} onClick={() => onMove({ zone: "pool", position: place - 1 })} className={smallButton}>
              Im Pool nach oben
            </button>
            <button type="button" disabled={place >= pool.length} onClick={() => onMove({ zone: "pool", position: place + 1 })} className={smallButton}>
              Im Pool nach unten
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onMove({ zone: "pool" })} className={smallButton}>
            In den Pool
          </button>
        )}
        {zone.zone !== "reject" && (
          <button type="button" onClick={() => onMove({ zone: "reject" })} className={smallButton}>
            Nicht aufnehmen
          </button>
        )}
      </div>
    </section>
  );
}

function DeptPopover({
  popover,
  card,
  board,
  deptIndex,
  onToggle,
  onClose,
}: {
  popover: Popover;
  card: BoardCard;
  board: Board;
  deptIndex: Map<string, number>;
  onToggle: (departmentId: string) => void;
  onClose: () => void;
}) {
  const assigned = board.assigned[card.id] ?? [];
  const order = [...card.wish, ...board.departments.map((d) => d.id).filter((d) => !card.wish.includes(d))];
  const left = Math.max(8, Math.min(popover.x, window.innerWidth - 300));
  const top = Math.min(popover.y, window.innerHeight - 60 - order.length * 44);
  return (
    <>
      <button type="button" aria-label="Schließen" onClick={onClose} className="fixed inset-0 z-[70] cursor-default" />
      <div
        role="dialog"
        aria-label={`Ressort für ${card.name}`}
        className="fixed z-[71] flex w-72 flex-col rounded-button bg-surface p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.22),0_0_0_1px_var(--c-line)]"
        style={{ left, top }}
      >
        <p className="px-2.5 pt-1.5 pb-1 text-small text-muted">Ressort für {card.name.split(" ")[0]} (höchstens zwei)</p>
        {order.map((d) => {
          const on = assigned.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(d)}
              className="flex min-h-11 items-center gap-2.5 rounded-field px-2.5 text-left text-note hover:bg-field"
            >
              <Dot index={deptIndex.get(d) ?? 0} />
              <span className="min-w-0 flex-1 truncate">{board.departments[deptIndex.get(d) ?? 0].name}</span>
              {on ? (
                <span className="text-accent" aria-hidden="true">
                  ✓
                </span>
              ) : (
                card.wish.includes(d) && <span className="text-small text-muted">Wunsch</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function SheetHead({ card, board, onDetails }: { card: BoardCard; board: Board; onDetails: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-section font-semibold">{card.name}</h2>
        <p className="text-small text-muted">
          {card.cohort} · Wunsch: {wishText(card, board)} · {formatShortScore(card.score)}
        </p>
      </div>
      <button type="button" onClick={onDetails} className={`${textButton} min-h-11 shrink-0`}>
        Details
      </button>
    </div>
  );
}

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <button type="button" aria-label="Schließen" onClick={onClose} className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.45)]" />
      <div
        role="dialog"
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col gap-4 overflow-y-auto rounded-t-group bg-surface px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(0,0,0,0.25)]"
      >
        <span aria-hidden="true" className="h-1.5 w-9 self-center rounded-full bg-line" />
        {children}
      </div>
    </>
  );
}

function ToastView({ toast }: { toast: Toast }) {
  return (
    <div
      role={toast.error ? "alert" : "status"}
      className={`fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-[80] w-max max-w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 rounded-button px-4 py-2.5 text-note shadow-[0_10px_30px_rgba(0,0,0,0.25)] lg:bottom-6 ${
        toast.error ? "bg-danger text-on-accent" : "bg-fg text-bg"
      }`}
    >
      {toast.text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History (Phase 17)
// ---------------------------------------------------------------------------

const timeFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
const formatTime = (iso: string) => timeFormat.format(new Date(iso));
const formatDay = (iso: string) => dayFormat.format(new Date(iso));
const firstName = (name: string) => name.split(" ")[0];

/** "Lena Hoffmann → Platz 4", "Plätze 10 → 11", "Lena Hoffmann: ÖA, SBS". */
function describeEvent(e: HistoryItem, board: Board): string {
  const name = board.cards.find((c) => c.id === e.applicantId)?.name ?? "Karte";
  switch (e.kind) {
    case "move":
      return `${name} → ${e.toZone === "seat" ? `Platz ${e.toPosition}` : e.toZone === "reject" ? "Nicht aufnehmen" : e.toPosition ? `Pool, Stelle ${e.toPosition}` : "Pool"}`;
    case "seats":
      return `Plätze ${e.fromSeats} → ${e.toSeats}`;
    case "departments": {
      const names = (e.toDepartments ?? []).map((id) => board.departments.find((d) => d.id === id)).filter((d) => !!d).map((d) => shortName(d!));
      return `${name}: ${names.length ? names.join(", ") : "kein Ressort"}`;
    }
    case "freeze":
      return "Board eingefroren";
    case "unfreeze":
      return "Einfrieren aufgehoben";
  }
}

function blockText(block: UndoBlock, e: HistoryItem, board: Board): string | null {
  const who = firstName(board.cards.find((c) => c.id === e.applicantId)?.name ?? "Die Karte");
  switch (block.error) {
    case "moved_since":
      return `${who} wurde seitdem bewegt.`;
    case "changed_since":
      return "Seitdem geändert.";
    case "seat_taken":
      return `Platz ${block.position} ist jetzt belegt.`;
    case "origin_gone":
      return `Platz ${block.position} gibt es nicht mehr.`;
    case "not_seated":
      return `${who} ist nicht mehr auf einem Platz.`;
    case "not_admin":
      return "Plätze nehmen nur Admins zurück.";
    default:
      return null;
  }
}

function HistoryList({
  board,
  state,
  isAdmin,
  memberId,
  editable,
  large,
  onUndo,
}: {
  board: Board;
  state: ReturnType<typeof boardState>;
  isAdmin: boolean;
  memberId: string;
  editable: boolean;
  large: boolean;
  onUndo: (eventId: string) => void;
}) {
  const undone = new Set(board.history.map((e) => e.undoes).filter((id): id is string => !!id));
  const rows = [...board.history].reverse();
  const text = large ? "text-body" : "text-note";
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className={sectionTitle}>Verlauf</h2>
        <p className="text-small text-muted">
          {rows.length ? `${rows.length} ${rows.length === 1 ? "Änderung" : "Änderungen"}, neueste oben` : "Noch keine Änderungen."}
        </p>
      </div>
      <ol className="-mx-5 flex flex-col">
        {rows.map((e) => {
          const block = editable ? undoBlock(board.history, e.id, state, board.seats, board.assigned, isAdmin) : null;
          const why = block ? blockText(block, e, board) : null;
          return (
            <li key={e.id} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 border-t border-line px-5 py-2.5 first:border-t-0">
              <span className="text-small leading-[21px] text-muted tabular-nums">{formatTime(e.at)}</span>
              <span className={`${text} min-w-0 ${undone.has(e.id) ? "text-muted line-through decoration-line" : ""}`}>
                {e.undoes && <span className="text-muted">Rückgängig: </span>}
                {describeEvent(e, board)}{" "}
                <span className="text-muted">· {e.actorId === memberId ? "du" : firstName(e.actorName)}</span>
              </span>
              {editable && !block ? (
                <button type="button" onClick={() => onUndo(e.id)} className="text-small leading-[21px] font-medium text-accent">
                  Rückgängig
                </button>
              ) : (
                <span />
              )}
              {why && <span className="col-start-2 col-end-4 text-small text-muted">{why}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
