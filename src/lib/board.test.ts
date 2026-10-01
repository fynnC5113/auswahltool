// Phase 16/17: Draft Board against "auswahltool-test". Tests run in order on
// one test round: 15 applicants, 10 seats (the check in PLAN.md).
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { createToken, hashToken } from "./applicant-token";
import { boardResult, freezeBoard, loadBoard, moveCard, setBoardDepartments, setSeats, undoEvent, unfreezeBoard, type Board } from "./board";
import { NONE, boardState, composition, poolOrder } from "./board-rules";

const emails: string[] = [];
const ids: Record<string, string> = {};
const as: Record<string, SupabaseClient> = {};
let roundId: string;
let departments: string[];
/** P01 … P15, by name. */
const people: string[] = [];

const pool = (board: Board) => {
  const state = boardState(board.cards.map((c) => c.id), board.placements);
  return poolOrder(state, (id) => {
    const c = board.cards.find((x) => x.id === id)!;
    return { score: c.score, name: c.name };
  });
};
const where = (board: Board, id: string) => board.placements.find((p) => p.applicantId === id);
const load = async (client = as.a) => (await loadBoard(client, roundId))!;

beforeAll(async () => {
  for (const [key, role] of [
    ["admin", "admin"],
    ["a", "member"],
    ["off", "member"],
  ] as const) {
    const email = testEmail(`phase16-${key}`);
    emails.push(email);
    ids[key] = await createMember(email, role);
    as[key] = await signIn(email);
  }
  // Signed in first, then deactivated: the session stays valid, the member row does not count.
  await admin.from("team_members").update({ active: false }).eq("id", ids.off);

  const round = await admin
    .from("rounds")
    .insert({
      year: 2026,
      title: `Phase 16 ${randomUUID()}`,
      seats: 10,
      interview_minutes: 30,
      buffer_minutes: 15,
      rebook_hours_before: 24,
      application_opens_at: "2026-09-01T00:00:00Z",
      application_closes_at: "2026-10-15T00:00:00Z",
      interviews_from: "2026-10-20",
      interviews_until: "2026-10-31",
      deletion_date: "2026-12-31",
      reply_to: "test@example.invalid",
    })
    .select("id")
    .single();
  if (round.error) throw new Error(round.error.message);
  roundId = round.data.id;

  const dep = await admin
    .from("departments")
    .insert([
      { round_id: roundId, position: 0, name: "Termine", short_name: "Termine" },
      { round_id: roundId, position: 1, name: "Öffentlichkeitsarbeit", short_name: "ÖA" },
      { round_id: roundId, position: 2, name: "Sozialberatungsstellen", short_name: "SBS" },
    ])
    .select("id, position");
  if (dep.error) throw new Error(dep.error.message);
  departments = dep.data.sort((x, y) => x.position - y.position).map((d) => d.id);

  const rows = Array.from({ length: 15 }, (_, i) => ({
    round_id: roundId,
    name: `Phase16 P${String(i + 1).padStart(2, "0")}`,
    email: `p${i + 1}-${randomUUID()}@example.invalid`,
    cohort: ["2023", "2024", "2025"][i % 3],
    token_hash: hashToken(createToken()),
  }));
  const applicants = await admin.from("applicants").insert(rows).select("id, name");
  if (applicants.error) throw new Error(applicants.error.message);
  people.push(...applicants.data.sort((x, y) => x.name.localeCompare(y.name)).map((a) => a.id));
}, 60_000);

afterAll(async () => {
  if (roundId) await admin.from("rounds").delete().eq("id", roundId);
  await deleteUsersByEmail(emails);
});

describe("before the selection round", () => {
  it("shows no cards and rejects every change", async () => {
    const board = await load();
    expect(board.active).toBe(false);
    expect(board.cards).toEqual([]);
    expect(await moveCard(as.a, people[0], "seat", 1, [])).toEqual({ error: "Das Board öffnet mit der Auswahlrunde." });
    expect(await setSeats(as.admin, roundId, 1)).toEqual({ error: "Das Board öffnet mit der Auswahlrunde." });
  });
});

describe("during the selection round", () => {
  beforeAll(async () => {
    const started = await admin
      .from("rounds")
      .update({ selection_started_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", roundId);
    if (started.error) throw new Error(started.error.message);
  });

  it("starts with every card in the pool, by name when no one has a short score", async () => {
    const board = await load();
    expect(board.active).toBe(true);
    expect(board.cards).toHaveLength(15);
    expect(board.departments.map((d) => d.short)).toEqual(["Termine", "ÖA", "SBS"]);
    expect(pool(board)).toEqual(people);
  });

  it("puts cards on all ten seats and rejects a taken seat", async () => {
    for (let n = 1; n <= 10; n++) {
      const board = await load();
      expect(await moveCard(as.a, people[n - 1], "seat", n, pool(board))).toEqual({ ok: true });
    }
    const board = await load();
    expect(await moveCard(as.a, people[10], "seat", 3, pool(board))).toEqual({ error: "Platz 3 ist belegt. Nimm einen freien Platz." });
    expect(await moveCard(as.a, people[10], "seat", 11, pool(board))).toEqual({
      error: "Das Board hat sich inzwischen geändert. Bitte lade die Seite neu.",
    });
    const seated = (await load()).placements.filter((p) => p.zone === "seat");
    expect(seated.map((p) => p.position).sort((x, y) => x! - y!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("moves a card into 'Nicht aufnehmen' and keeps the pool order after reloading", async () => {
    let board = await load();
    expect(await moveCard(as.a, people[11], "reject", null, pool(board))).toEqual({ ok: true });
    board = await load();
    // P15 to the top of the pool; the others keep their starting order.
    expect(await moveCard(as.a, people[14], "pool", 1, pool(board))).toEqual({ ok: true });
    board = await load();
    expect(pool(board)).toEqual([people[14], people[10], people[12], people[13]]);
    // A card from a seat goes to the chosen place; its seat stays empty.
    expect(await moveCard(as.a, people[4], "pool", 2, pool(board))).toEqual({ ok: true });
    board = await load();
    expect(pool(board)).toEqual([people[14], people[4], people[10], people[12], people[13]]);
    expect(board.placements.some((p) => p.zone === "seat" && p.position === 5)).toBe(false);
    expect(where(board, people[0])).toMatchObject({ zone: "seat", position: 1 });
    expect(where(board, people[11])).toMatchObject({ zone: "reject", position: null });
  });

  it("rejects an old view of the pool", async () => {
    const board = await load();
    const old = pool(board).slice(1);
    expect(await moveCard(as.a, people[10], "pool", 1, old)).toEqual({
      error: "Das Board hat sich inzwischen geändert. Bitte lade die Seite neu.",
    });
  });

  it("gives one or two departments to cards on a seat, never a third", async () => {
    expect(await setBoardDepartments(as.a, people[0], [departments[0]])).toEqual({ ok: true });
    expect(await setBoardDepartments(as.a, people[1], [departments[0], departments[1]])).toEqual({ ok: true });
    expect(await setBoardDepartments(as.a, people[2], [departments[2]])).toEqual({ ok: true });
    expect(await setBoardDepartments(as.a, people[3], departments)).toEqual({ error: "Höchstens zwei Ressorts pro Person." });
    expect(await setBoardDepartments(as.a, people[14], [departments[0]])).toEqual({
      error: "Ein Ressort gibt es nur für Karten auf einem Platz.",
    });
    const board = await load();
    expect(board.assigned[people[1]]).toEqual([departments[0], departments[1]]);
    expect(board.assigned[people[3]]).toBeUndefined();
  });

  it("counts the bar like a count by hand", async () => {
    const board = await load();
    const state = boardState(board.cards.map((c) => c.id), board.placements);
    const bar = composition(state, board.seats, board.cards.map((c) => ({ applicantId: c.id, cohort: c.cohort })), new Map(Object.entries(board.assigned)), departments);
    // Seats: P01–P04 and P06–P10 (P05 went back to the pool). Cohorts by index % 3: 2023 P01 P04 P07 P10, 2024 P02 P08, 2025 P03 P06 P09.
    expect(bar.filled).toBe(9);
    expect(bar.cohorts).toEqual([
      { cohort: "2023", count: 4 },
      { cohort: "2024", count: 2 },
      { cohort: "2025", count: 3 },
    ]);
    // Termine: P01, P02; ÖA: P02; SBS: P03; without department: P04, P06–P10 = 6.
    expect(bar.departments).toEqual([
      { key: departments[0], count: 2 },
      { key: departments[1], count: 1 },
      { key: departments[2], count: 1 },
      { key: NONE, count: 6 },
    ]);
  });

  it("lets only admins change the seats, '−' only for an empty last seat", async () => {
    expect(await setSeats(as.a, roundId, 1)).toEqual({ error: "Die Zahl der Plätze ändern nur Admins." });
    expect(await setSeats(as.admin, roundId, -1)).toEqual({
      error: "Platz 10 ist belegt. Nur ein leerer letzter Platz lässt sich wegnehmen.",
    });
    const board = await load();
    expect(await moveCard(as.a, people[9], "seat", 5, pool(board))).toEqual({ ok: true });
    expect(await setSeats(as.admin, roundId, -1)).toEqual({ ok: true });
    expect((await load()).seats).toBe(9);
    expect(await setSeats(as.admin, roundId, 1)).toEqual({ ok: true });
    expect((await load()).seats).toBe(10);
  });

  it("writes every change to the history", async () => {
    const { data, error } = await admin.from("board_events").select("kind, actor_id").eq("round_id", roundId);
    if (error) throw new Error(error.message);
    const count = (kind: string) => data.filter((e) => e.kind === kind).length;
    expect(count("move")).toBe(14);
    expect(count("departments")).toBe(3);
    expect(count("seats")).toBe(2);
    expect(data.filter((e) => e.kind !== "seats").every((e) => e.actor_id === ids.a)).toBe(true);
  });

  it("allows no direct writes, not for deactivated members, not without sign-in", async () => {
    const direct = await as.a.from("board_positions").update({ zone: "reject" }).eq("applicant_id", people[0]).select("id");
    expect(direct.error?.message ?? (direct.data?.length === 0 ? "no rows" : "written")).not.toBe("written");
    const insert = await as.a.from("board_departments").insert({ round_id: roundId, applicant_id: people[5], department_id: departments[0] });
    expect(insert.error).not.toBeNull();

    const board = await load();
    expect(await moveCard(as.off, people[10], "reject", null, pool(board))).toEqual({ error: "Dein Zugang ist nicht (mehr) freigeschaltet." });

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const call = await anon.rpc("move_card", { p_applicant_id: people[10], p_to_zone: "reject", p_to_position: null, p_pool: [] });
    expect(call.error).not.toBeNull();
    const read = await anon.from("board_positions").select("applicant_id").eq("round_id", roundId);
    expect(read.data ?? []).toEqual([]);

    expect(where(await load(), people[0])).toMatchObject({ zone: "seat", position: 1 });
    expect(where(await load(), people[10])?.zone ?? "pool").toBe("pool");
  });
});

describe("undo (Phase 17)", () => {
  // State here: seats 1–4 P01–P04, 5 P10, 6–9 P06–P09, 10 empty; pool P15 P05 P11 P13 P14; reject P12.
  const last = async () => {
    const { data, error } = await admin.from("board_events").select("id").eq("round_id", roundId).order("seq", { ascending: false }).limit(1).single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };
  const eventOf = async (kind: string, applicantId: string) => {
    const { data, error } = await admin
      .from("board_events")
      .select("id")
      .eq("round_id", roundId)
      .eq("kind", kind)
      .eq("applicant_id", applicantId)
      .order("seq")
      .limit(1)
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  it("moves a card back to its old place in the pool, once; the undo can be undone", async () => {
    const before = pool(await load());
    expect(await moveCard(as.a, people[10], "seat", 10, before)).toEqual({ ok: true });
    const move = await last();
    expect(await undoEvent(as.a, move, pool(await load()))).toEqual({ ok: true });
    expect(pool(await load())).toEqual(before);
    const undo = await last();
    const { data } = await admin.from("board_events").select("undoes_event_id, actor_id").eq("id", undo).single();
    expect(data).toEqual({ undoes_event_id: move, actor_id: ids.a });
    expect(await undoEvent(as.a, move, pool(await load()))).toEqual({ error: "Das ist schon rückgängig gemacht." });

    expect(await undoEvent(as.admin, undo, pool(await load()))).toEqual({ ok: true });
    expect(where(await load(), people[10])).toMatchObject({ zone: "seat", position: 10 });
    expect(await undoEvent(as.a, await last(), pool(await load()))).toEqual({ ok: true });
    expect(pool(await load())).toEqual(before);
  });

  it("rejects when the card has moved since or its old seat is taken", async () => {
    let board = await load();
    expect(await moveCard(as.a, people[12], "reject", null, pool(board))).toEqual({ ok: true });
    const rejected = await last();
    board = await load();
    expect(await moveCard(as.a, people[12], "pool", null, pool(board))).toEqual({ ok: true });
    expect(await undoEvent(as.a, rejected, pool(await load()))).toEqual({ error: "Die Karte wurde seitdem bewegt. Rückgängig geht nicht mehr." });

    board = await load();
    expect(await moveCard(as.a, people[0], "reject", null, pool(board))).toEqual({ ok: true });
    const leftSeat = await last();
    board = await load();
    expect(await moveCard(as.a, people[14], "seat", 1, pool(board))).toEqual({ ok: true });
    expect(await undoEvent(as.a, leftSeat, pool(await load()))).toEqual({ error: "Platz 1 ist jetzt belegt. Rückgängig geht nicht mehr." });
    expect(where(await load(), people[0])).toMatchObject({ zone: "reject" });
  });

  it("undoes departments only while they are unchanged", async () => {
    expect(await undoEvent(as.a, await eventOf("departments", people[1]), [])).toEqual({ ok: true });
    expect((await load()).assigned[people[1]]).toBeUndefined();

    expect(await setBoardDepartments(as.a, people[2], [departments[1]])).toEqual({ ok: true });
    expect(await undoEvent(as.a, await eventOf("departments", people[2]), [])).toEqual({
      error: "Das wurde seitdem geändert. Rückgängig geht nicht mehr.",
    });
  });

  it("lets only admins undo '+'/'−'", async () => {
    expect(await setSeats(as.admin, roundId, 1)).toEqual({ ok: true });
    const plus = await last();
    expect(await undoEvent(as.a, plus, [])).toEqual({ error: "Die Zahl der Plätze ändern nur Admins." });
    expect(await undoEvent(as.admin, plus, [])).toEqual({ ok: true });
    expect((await load()).seats).toBe(10);
  });

  it("shows the history in order with names", async () => {
    const board = await load();
    const tail = board.history.slice(-2);
    expect(tail.map((e) => e.kind)).toEqual(["seats", "seats"]);
    expect(tail[1].undoes).toBe(tail[0].id);
    expect(tail.every((e) => e.actorName.startsWith("Test"))).toBe(true);
  });
});

describe("freezing (Phase 17)", () => {
  // State here: seats 1 P15, 2–4 P02–P04, 5 P10, 6–9 P06–P09, 10 empty; pool P05 P11 P14 P13; reject P01 P12.
  const frozen = { error: "Das Board ist eingefroren. Es lässt sich nichts mehr verschieben." };

  it("lets only admins freeze", async () => {
    expect(await freezeBoard(as.a, roundId)).toEqual({ error: "Einfrieren und Aufheben dürfen nur Admins." });
    expect(await freezeBoard(as.off, roundId)).toEqual({ error: "Dein Zugang ist nicht (mehr) freigeschaltet." });
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect((await anon.rpc("freeze_board", { p_round_id: roundId })).error).not.toBeNull();
    expect((await anon.rpc("undo_board_event", { p_event_id: (await load()).history[0].id, p_pool: [] })).error).not.toBeNull();
    expect(await freezeBoard(as.admin, roundId)).toEqual({ ok: true });
    const board = await load();
    expect(board.frozen).toBe(true);
    expect(board.active).toBe(false);
    expect(board.frozenBy).toBe((await admin.from("team_members").select("name").eq("id", ids.admin).single()).data!.name);
    expect(board.history.at(-1)?.kind).toBe("freeze");
  });

  it("rejects every change afterwards, also directly in the database", async () => {
    const board = await load();
    expect(await moveCard(as.a, people[10], "reject", null, pool(board))).toEqual(frozen);
    expect(await setBoardDepartments(as.a, people[2], [])).toEqual(frozen);
    expect(await setSeats(as.admin, roundId, 1)).toEqual(frozen);
    expect(await undoEvent(as.admin, board.history.at(-2)!.id, pool(board))).toEqual(frozen);
    for (const client of [as.a, as.admin]) {
      const direct = await client.from("board_positions").update({ zone: "reject", position: null }).eq("applicant_id", people[14]).select("id");
      expect(direct.error?.message ?? (direct.data?.length === 0 ? "no rows" : "written")).not.toBe("written");
      const event = await client.from("board_events").insert({ round_id: roundId, applicant_id: people[14], actor_id: ids.admin, to_zone: "reject" });
      expect(event.error).not.toBeNull();
    }
    expect(where(await load(), people[14])).toMatchObject({ zone: "seat", position: 1 });
  });

  it("gives the result: seats with departments, the pool in order, the rejected", async () => {
    const board = await load();
    const result = boardResult(board);
    const name = (i: number) => `Phase16 P${String(i).padStart(2, "0")}`;
    expect(result.accepted.map((p) => [p.seat, p.name])).toEqual([
      [1, name(15)],
      [2, name(2)],
      [3, name(3)],
      [4, name(4)],
      [5, name(10)],
      [6, name(6)],
      [7, name(7)],
      [8, name(8)],
      [9, name(9)],
    ]);
    expect(result.accepted.find((p) => p.seat === 3)?.departments.map((d) => d.short)).toEqual(["ÖA"]);
    expect(result.accepted.find((p) => p.seat === 2)?.departments).toEqual([]);
    expect(result.waiting.map((p) => p.name)).toEqual([name(5), name(11), name(14), name(13)]);
    expect(result.rejected.map((p) => p.name)).toEqual([name(1), name(12)]);
    expect(result.rejected[0].email).toMatch(/^p1-.*@example\.invalid$/);
  });

  it("lets only admins lift the freeze; freezing itself is not undone in the history", async () => {
    expect(await unfreezeBoard(as.a, roundId)).toEqual({ error: "Einfrieren und Aufheben dürfen nur Admins." });
    expect(await unfreezeBoard(as.admin, roundId)).toEqual({ ok: true });
    let board = await load();
    expect(board.active).toBe(true);
    expect(board.frozen).toBe(false);
    expect(board.history.slice(-2).map((e) => e.kind)).toEqual(["freeze", "unfreeze"]);
    expect(await undoEvent(as.admin, board.history.at(-1)!.id, pool(board))).toEqual({ error: "Das lässt sich nicht rückgängig machen." });
    expect(await unfreezeBoard(as.admin, roundId)).toEqual({ error: "Das Board ist nicht eingefroren." });
    expect(await freezeBoard(as.admin, roundId)).toEqual({ ok: true });
    board = await load();
    expect(board.frozen).toBe(true);
  });
});

describe("after freezing", () => {
  it("rejects every change", async () => {
    const board = await load();
    expect(board.active).toBe(false);
    expect(board.frozen).toBe(true);
    const frozen = { error: "Das Board ist eingefroren. Es lässt sich nichts mehr verschieben." };
    expect(await moveCard(as.a, people[10], "reject", null, pool(board))).toEqual(frozen);
    expect(await setBoardDepartments(as.a, people[0], [])).toEqual(frozen);
    expect(await setSeats(as.admin, roundId, 1)).toEqual(frozen);
  });
});
