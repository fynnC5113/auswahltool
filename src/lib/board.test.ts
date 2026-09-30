// Phase 16: Draft Board against "auswahltool-test". Tests run in order on
// one test round: 15 applicants, 10 seats (the check in PLAN.md).
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { createToken, hashToken } from "./applicant-token";
import { loadBoard, moveCard, setBoardDepartments, setSeats, type Board } from "./board";
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

describe("after freezing", () => {
  it("rejects every change", async () => {
    await admin.from("rounds").update({ board_frozen_at: new Date().toISOString() }).eq("id", roundId);
    const board = await load();
    expect(board.active).toBe(false);
    expect(board.frozen).toBe(true);
    const frozen = { error: "Das Board ist eingefroren. Es lässt sich nichts mehr verschieben." };
    expect(await moveCard(as.a, people[10], "reject", null, pool(board))).toEqual(frozen);
    expect(await setBoardDepartments(as.a, people[0], [])).toEqual(frozen);
    expect(await setSeats(as.admin, roundId, 1)).toEqual(frozen);
  });
});
