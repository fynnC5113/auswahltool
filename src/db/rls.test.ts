// Phase 3: RLS policies (TECH_DESIGN section 5), tested against "auswahltool-test".
// Every rule is tried as admin, member, deactivated member and anonymous; each
// role gets its own "may" or "may not" test. Fixtures are written with the
// secret key (bypasses RLS) and removed afterwards.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishableKey || !secretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be set in .env.local",
  );
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(url, secretKey, noSession);

// insufficient_privilege: an RLS "with check" violation or a missing grant (anon)
const DENIED = "42501";

type Role = "admin" | "member" | "inactive" | "anon";
const ROLES: Role[] = ["admin", "member", "inactive", "anon"];

/** Logged-in clients. "member" is a member who is not an interviewer anywhere;
 *  interviewerA/B share the slots used for the sight lock. */
const as = {} as Record<Role | "interviewerA" | "interviewerB", SupabaseClient>;
const id = {} as Record<Exclude<Role, "anon"> | "interviewerA" | "interviewerB", string>;
/** The member id a role writes as; anon pretends to be "member". */
const ownId = (role: Role) => (role === "anon" ? id.member : id[role]);

const userIds: string[] = [];
const roundIds: string[] = [];
const statsIds: string[] = [];
const cvPaths: string[] = [];

function ok<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}

let counter = 0;
const next = () => ++counter;

// ---------------------------------------------------------------------------
// Fixture helpers (secret key)
// ---------------------------------------------------------------------------

async function createAuthUser(): Promise<{ id: string; email: string }> {
  const email = `phase3-${randomUUID()}@example.invalid`;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message ?? "createUser returned no user");
  userIds.push(data.user.id);
  return { id: data.user.id, email };
}

/** Creates a team member and signs them in the way the app will: a magic link
 *  generated on the server, redeemed with verifyOtp. No mail is sent. */
async function signIn(role: "admin" | "member", active = true) {
  const user = await createAuthUser();
  ok(await db.from("team_members").insert({ id: user.id, email: user.email, name: `Test ${role}`, role, active }));
  const link = await db.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (link.error) throw new Error(link.error.message);
  const client = createClient(url!, publishableKey!, noSession);
  const { error } = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "email" });
  if (error) throw new Error(error.message);
  return { id: user.id, client };
}

function roundRow(extra: Record<string, unknown> = {}) {
  const roundId = randomUUID();
  roundIds.push(roundId);
  return {
    id: roundId,
    year: 2026,
    title: "Phase-3-Testrunde",
    seats: 10,
    interview_minutes: 30,
    buffer_minutes: 15,
    application_opens_at: "2026-10-01T00:00:00+02:00",
    application_closes_at: "2026-10-15T23:59:00+02:00",
    interviews_from: "2026-10-20",
    interviews_until: "2026-10-31",
    deletion_date: "2026-12-31",
    reply_to: "test@example.invalid",
    ...extra,
  };
}

async function createRound(extra: Record<string, unknown> = {}): Promise<string> {
  return ok(await db.from("rounds").insert(roundRow(extra)).select("id").single()).id;
}

async function createLocation(roundId: string): Promise<string> {
  return ok(await db.from("locations").insert({ round_id: roundId, name: `Raum ${next()}` }).select("id").single()).id;
}

function applicantRow(roundId: string) {
  return {
    round_id: roundId,
    name: "Test Bewerber",
    email: `${randomUUID()}@example.invalid`,
    cohort: "2025",
    token_hash: randomUUID(),
  };
}

async function createApplicant(roundId: string): Promise<string> {
  return ok(await db.from("applicants").insert(applicantRow(roundId)).select("id").single()).id;
}

/** Every slot gets its own hour: the pair may not sit in two overlapping slots. */
function slotRow(roundId: string, locationId: string, applicantId: string | null = null) {
  const start = new Date(Date.UTC(2026, 9, 21, 6) + next() * 60 * 60_000);
  return {
    round_id: roundId,
    location_id: locationId,
    starts_at: start.toISOString(),
    interview_ends_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
    ends_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
    interviewer_a: id.interviewerA,
    interviewer_b: id.interviewerB,
    status: "confirmed",
    applicant_id: applicantId,
  };
}

/** A fresh 15-minute cell, unique within the test run. */
function quarter() {
  const start = new Date(Date.UTC(2026, 9, 20, 6) + next() * 15 * 60_000);
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 15 * 60_000).toISOString() };
}

const pdf = () => new Blob(["%PDF-1.4\n"], { type: "application/pdf" });

// ---------------------------------------------------------------------------
// Access helpers: true = allowed, false = denied. Any other error fails the test.
// Update and delete return the affected rows; RLS denial means zero rows.
// ---------------------------------------------------------------------------

type Match = Record<string, string>;

function denied(table: string, error: { code: string; message: string }) {
  if (error.code === DENIED) return false;
  throw new Error(`${table}: ${error.code} ${error.message}`);
}

async function canSelect(c: SupabaseClient, table: string, match: Match) {
  const { data, error } = await c.from(table).select("*").match(match);
  return error ? denied(table, error) : data.length > 0;
}

async function canInsert(c: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { error } = await c.from(table).insert(row);
  return error ? denied(table, error) : true;
}

async function canUpdate(c: SupabaseClient, table: string, patch: Record<string, unknown>, match: Match) {
  const { data, error } = await c.from(table).update(patch).match(match).select();
  return error ? denied(table, error) : data.length > 0;
}

async function canDelete(c: SupabaseClient, table: string, match: Match) {
  const { data, error } = await c.from(table).delete().match(match).select();
  return error ? denied(table, error) : data.length > 0;
}

/** One test per role: "<rule>: admin may", "<rule>: anon may not", ... */
function rule(name: string, allowed: Role[], attempt: (c: SupabaseClient, role: Role) => Promise<boolean>) {
  for (const role of ROLES) {
    const may = allowed.includes(role);
    it(`${name}: ${role} ${may ? "may" : "may not"}`, async () => {
      expect(await attempt(as[role], role)).toBe(may);
    });
  }
}

const MEMBERS: Role[] = ["admin", "member"];
const ADMIN: Role[] = ["admin"];
const NOBODY: Role[] = [];

// ---------------------------------------------------------------------------
// Shared fixture: one open round R with a row in every table, one frozen round
// ---------------------------------------------------------------------------

const f = {} as {
  round: string;
  question: string;
  department: string;
  criterion: string;
  criterion2: string;
  applicant: string;
  applicantFree: string;
  location: string;
  slot: string;
  freeSlot: string;
  event: string;
  partnerFeedback: string;
  stats: string;
  cvPath: string;
  ownFeedback: Record<Role, string>;
  freezeTarget: string;
  frozenRound: string;
  frozenApplicant: string;
  frozenFeedback: Record<Role, string>;
};

beforeAll(async () => {
  for (const [key, role, active] of [
    ["admin", "admin", true],
    ["member", "member", true],
    ["inactive", "member", false],
    ["interviewerA", "member", true],
    ["interviewerB", "member", true],
  ] as const) {
    const user = await signIn(role, active);
    as[key] = user.client;
    id[key] = user.id;
  }
  as.anon = createClient(url, publishableKey, noSession);

  f.round = await createRound();
  f.question = ok(await db.from("questions").insert({ round_id: f.round, position: 1, text: "Warum?" }).select("id").single()).id;
  f.department = ok(await db.from("departments").insert({ round_id: f.round, position: 1, name: "Presse" }).select("id").single()).id;
  const criterion = (position: number) => ({ round_id: f.round, position, name: "Motivation", weight: 1, scale_min: 1, scale_max: 5 });
  f.criterion = ok(await db.from("criteria").insert(criterion(1)).select("id").single()).id;
  f.criterion2 = ok(await db.from("criteria").insert(criterion(2)).select("id").single()).id;

  f.applicant = await createApplicant(f.round);
  f.applicantFree = await createApplicant(f.round);
  ok(await db.from("answers").insert({ applicant_id: f.applicant, question_id: f.question, text: "Darum." }));
  ok(await db.from("applicant_departments").insert({ applicant_id: f.applicant, department_id: f.department }));
  f.cvPath = `${f.round}/${f.applicant}.pdf`;
  cvPaths.push(f.cvPath);
  ok(await db.storage.from("cv").upload(f.cvPath, pdf(), { contentType: "application/pdf" }));

  f.location = await createLocation(f.round);
  ok(await db.from("blocked_times").insert({ location_id: f.location, ...quarter() }));
  f.slot = ok(await db.from("slots").insert(slotRow(f.round, f.location, f.applicant)).select("id").single()).id;
  f.freeSlot = ok(await db.from("slots").insert(slotRow(f.round, await createLocation(f.round))).select("id").single()).id;
  ok(await db.from("availabilities").insert({ round_id: f.round, member_id: id.interviewerA, ...quarter() }));
  ok(await db.from("member_round_settings").insert({ round_id: f.round, member_id: id.interviewerA, max_interviews: 5 }));
  ok(await db.from("conflicts").insert({ applicant_id: f.applicant, member_id: id.interviewerA }));

  // Submitted entry of interviewer B; "member" is not in the slot, so the sight lock lets them read it.
  f.partnerFeedback = ok(
    await db
      .from("feedback")
      .insert({ applicant_id: f.applicant, member_id: id.interviewerB, submitted_at: new Date().toISOString() })
      .select("id")
      .single(),
  ).id;
  ok(await db.from("feedback_scores").insert({ feedback_id: f.partnerFeedback, criterion_id: f.criterion, score: 4 }));

  // A draft per role on a separate applicant, for the score write tests.
  const scoreApplicant = await createApplicant(f.round);
  f.ownFeedback = {} as Record<Role, string>;
  for (const role of ["admin", "member", "inactive"] as const) {
    f.ownFeedback[role] = ok(
      await db.from("feedback").insert({ applicant_id: scoreApplicant, member_id: id[role] }).select("id").single(),
    ).id;
  }
  f.ownFeedback.anon = f.ownFeedback.member;

  ok(await db.from("board_positions").insert({ round_id: f.round, applicant_id: f.applicant }));
  f.event = ok(
    await db
      .from("board_events")
      .insert({ round_id: f.round, applicant_id: f.applicant, actor_id: id.interviewerA, from_zone: "pool", to_zone: "seat", to_position: 1 })
      .select("id")
      .single(),
  ).id;

  f.stats = ok(
    await db.from("round_stats").insert({ year: 1999, applications: 0, interviews: 0, admitted: 0 }).select("id").single(),
  ).id;
  statsIds.push(f.stats);

  f.freezeTarget = await createRound();

  f.frozenRound = await createRound({ board_frozen_at: new Date().toISOString(), board_frozen_by: id.admin });
  f.frozenApplicant = await createApplicant(f.frozenRound);
  ok(await db.from("board_positions").insert({ round_id: f.frozenRound, applicant_id: f.frozenApplicant }));
  f.frozenFeedback = {} as Record<Role, string>;
  for (const role of ["admin", "member", "inactive"] as const) {
    f.frozenFeedback[role] = ok(
      await db.from("feedback").insert({ applicant_id: f.frozenApplicant, member_id: id[role] }).select("id").single(),
    ).id;
  }
  f.frozenFeedback.anon = f.frozenFeedback.member;
}, 120_000);

afterAll(async () => {
  if (cvPaths.length) await db.storage.from("cv").remove(cvPaths);
  if (roundIds.length) await db.from("rounds").delete().in("id", roundIds);
  if (statsIds.length) await db.from("round_stats").delete().in("id", statsIds);
  // Deleting the auth user cascades to team_members.
  for (const userId of userIds) await db.auth.admin.deleteUser(userId);
}, 120_000);

// ---------------------------------------------------------------------------
// TECH_DESIGN 5, row by row
// ---------------------------------------------------------------------------

describe("team_members: members read, admins write", () => {
  rule("read", MEMBERS, (c) => canSelect(c, "team_members", { id: id.interviewerA }));
  rule("insert", ADMIN, async (c) => {
    const user = await createAuthUser();
    return canInsert(c, "team_members", { id: user.id, email: user.email, name: "Neu" });
  });
  rule("update another member", ADMIN, (c) => canUpdate(c, "team_members", { name: "Test member" }, { id: id.interviewerB }));
  // For the admin this is a no-op; everyone else must not escalate.
  rule("set own role to admin", ADMIN, (c, role) => canUpdate(c, "team_members", { role: "admin" }, { id: ownId(role) }));
});

describe("rounds and configuration: members read, admins write", () => {
  rule("read rounds", MEMBERS, (c) => canSelect(c, "rounds", { id: f.round }));
  rule("insert rounds", ADMIN, (c) => canInsert(c, "rounds", roundRow()));
  rule("freeze the board (update rounds)", ADMIN, (c, role) =>
    canUpdate(c, "rounds", { board_frozen_at: new Date().toISOString(), board_frozen_by: ownId(role) }, { id: f.freezeTarget }),
  );
  rule("read questions", MEMBERS, (c) => canSelect(c, "questions", { id: f.question }));
  rule("insert questions", ADMIN, (c) => canInsert(c, "questions", { round_id: f.round, position: 100 + next(), text: "Neu?" }));
  rule("read departments", MEMBERS, (c) => canSelect(c, "departments", { id: f.department }));
  rule("insert departments", ADMIN, (c) => canInsert(c, "departments", { round_id: f.round, position: 100 + next(), name: "Neu" }));
  rule("read criteria", MEMBERS, (c) => canSelect(c, "criteria", { id: f.criterion }));
  rule("insert criteria", ADMIN, (c) =>
    canInsert(c, "criteria", { round_id: f.round, position: 100 + next(), name: "Neu", weight: 1, scale_min: 1, scale_max: 5 }),
  );
});

describe("applicants, answers, CV: members read, admins write", () => {
  rule("read applicants", MEMBERS, (c) => canSelect(c, "applicants", { id: f.applicant }));
  rule("insert applicants", ADMIN, (c) => canInsert(c, "applicants", applicantRow(f.round)));
  rule("update applicant status", ADMIN, (c) => canUpdate(c, "applicants", { status: "active" }, { id: f.applicant }));
  rule("read answers", MEMBERS, (c) => canSelect(c, "answers", { applicant_id: f.applicant }));
  rule("insert answers", ADMIN, async (c) =>
    canInsert(c, "answers", { applicant_id: await createApplicant(f.round), question_id: f.question, text: "Neu" }),
  );
  rule("read applicant_departments", MEMBERS, (c) => canSelect(c, "applicant_departments", { applicant_id: f.applicant }));
  rule("insert applicant_departments", ADMIN, async (c) =>
    canInsert(c, "applicant_departments", { applicant_id: await createApplicant(f.round), department_id: f.department }),
  );
  // Phase 7: the admin entry writes through save_application with the session.
  // Own round: other rules add questions to f.round, which would all need answers.
  rule("save an application (save_application)", ADMIN, async (c) => {
    const round = await createRound();
    const question = ok(await db.from("questions").insert({ round_id: round, position: 1, text: "Warum?" }).select("id").single()).id;
    const { error } = await c.rpc("save_application", {
      p_create: true,
      p_applicant: { ...applicantRow(round), id: randomUUID(), source: "admin" },
      p_answers: [{ question_id: question, text: "Weil." }],
      p_department_ids: [],
    });
    if (!error) return true;
    if (error.code === DENIED) return false;
    throw new Error(error.message);
  });
  rule("create a signed CV link", MEMBERS, async (c) => {
    const { data, error } = await c.storage.from("cv").createSignedUrl(f.cvPath, 60);
    return !error && Boolean(data?.signedUrl);
  });
  rule("upload a CV", ADMIN, async (c) => {
    const path = `${f.round}/${randomUUID()}.pdf`;
    cvPaths.push(path);
    const { error } = await c.storage.from("cv").upload(path, pdf(), { contentType: "application/pdf" });
    return !error;
  });
  rule("delete a CV", ADMIN, async (c) => {
    const path = `${f.round}/${randomUUID()}.pdf`;
    cvPaths.push(path);
    ok(await db.storage.from("cv").upload(path, pdf(), { contentType: "application/pdf" }));
    const { data, error } = await c.storage.from("cv").remove([path]);
    return !error && (data?.length ?? 0) > 0;
  });
});

describe("availabilities, member_round_settings: members read, own rows only", () => {
  rule("read availabilities", MEMBERS, (c) => canSelect(c, "availabilities", { member_id: id.interviewerA }));
  rule("insert own availability", MEMBERS, (c, role) =>
    canInsert(c, "availabilities", { round_id: f.round, member_id: ownId(role), ...quarter() }),
  );
  rule("insert someone else's availability", NOBODY, (c) =>
    canInsert(c, "availabilities", { round_id: f.round, member_id: id.interviewerA, ...quarter() }),
  );
  rule("delete someone else's availability", NOBODY, (c) => canDelete(c, "availabilities", { member_id: id.interviewerA }));
  rule("read member_round_settings", MEMBERS, (c) => canSelect(c, "member_round_settings", { member_id: id.interviewerA }));
  rule("insert own member_round_settings", MEMBERS, (c, role) =>
    canInsert(c, "member_round_settings", { round_id: f.round, member_id: ownId(role), max_interviews: 3 }),
  );
  rule("update someone else's member_round_settings", NOBODY, (c) =>
    canUpdate(c, "member_round_settings", { max_interviews: 9 }, { member_id: id.interviewerA }),
  );
  // Phase 11: "preferred" only through set_preferred, and only by admins.
  rule("set own preferred directly", NOBODY, (c, role) =>
    canUpdate(c, "member_round_settings", { preferred: true }, { round_id: f.round, member_id: ownId(role) }),
  );
  rule("set preferred (set_preferred)", ADMIN, async (c) => {
    const { error } = await c.rpc("set_preferred", { p_round_id: f.round, p_member_id: id.interviewerB, p_preferred: true });
    if (!error) return true;
    if (error.code === DENIED) return false;
    throw new Error(error.message);
  });
});

describe("locations, blocked_times, slots: members read, admins write", () => {
  rule("read locations", MEMBERS, (c) => canSelect(c, "locations", { id: f.location }));
  rule("insert locations", ADMIN, (c) => canInsert(c, "locations", { round_id: f.round, name: "Neu" }));
  rule("read blocked_times", MEMBERS, (c) => canSelect(c, "blocked_times", { location_id: f.location }));
  rule("insert blocked_times", ADMIN, (c) => canInsert(c, "blocked_times", { location_id: f.location, ...quarter() }));
  rule("read slots", MEMBERS, (c) => canSelect(c, "slots", { id: f.slot }));
  rule("insert slots", ADMIN, async (c) => canInsert(c, "slots", slotRow(f.round, await createLocation(f.round))));
  rule("update slots", ADMIN, (c) => canUpdate(c, "slots", { status: "confirmed" }, { id: f.freeSlot }));
});

describe("conflicts: members read, own marking only", () => {
  rule("read", MEMBERS, (c) => canSelect(c, "conflicts", { applicant_id: f.applicant }));
  rule("mark oneself", MEMBERS, (c, role) => canInsert(c, "conflicts", { applicant_id: f.applicantFree, member_id: ownId(role) }));
  rule("mark someone else", NOBODY, (c) => canInsert(c, "conflicts", { applicant_id: f.applicantFree, member_id: id.interviewerB }));
  rule("remove own marking", MEMBERS, async (c, role) => {
    const applicantId = await createApplicant(f.round);
    ok(await db.from("conflicts").insert({ applicant_id: applicantId, member_id: ownId(role) }));
    return canDelete(c, "conflicts", { applicant_id: applicantId, member_id: ownId(role) });
  });
  rule("remove someone else's marking", NOBODY, (c) =>
    canDelete(c, "conflicts", { applicant_id: f.applicant, member_id: id.interviewerA }),
  );
});

describe("feedback, feedback_scores: sight lock read, own writes while open", () => {
  rule("read a released entry", MEMBERS, (c) => canSelect(c, "feedback", { id: f.partnerFeedback }));
  rule("read its scores", MEMBERS, (c) => canSelect(c, "feedback_scores", { feedback_id: f.partnerFeedback }));
  rule("write own entry", MEMBERS, async (c, role) =>
    canInsert(c, "feedback", { applicant_id: await createApplicant(f.round), member_id: ownId(role) }),
  );
  rule("write an entry as someone else", NOBODY, async (c) =>
    canInsert(c, "feedback", { applicant_id: await createApplicant(f.round), member_id: id.interviewerA }),
  );
  rule("change someone else's entry", NOBODY, (c) => canUpdate(c, "feedback", { overall_text: "geändert" }, { id: f.partnerFeedback }));
  rule("write own scores", MEMBERS, (c, role) =>
    canInsert(c, "feedback_scores", { feedback_id: f.ownFeedback[role], criterion_id: f.criterion, score: 3 }),
  );
  rule("write scores into someone else's entry", NOBODY, (c) =>
    canInsert(c, "feedback_scores", { feedback_id: f.partnerFeedback, criterion_id: f.criterion2, score: 3 }),
  );
  rule("change own entry after the board is frozen", NOBODY, (c, role) =>
    canUpdate(c, "feedback", { overall_text: "zu spät" }, { id: f.frozenFeedback[role] }),
  );
  rule("write own scores after the board is frozen", NOBODY, (c, role) =>
    canInsert(c, "feedback_scores", { feedback_id: f.frozenFeedback[role], criterion_id: f.criterion, score: 3 }),
  );
});

describe("board_positions, board_events: members write while open", () => {
  rule("read board_positions", MEMBERS, (c) => canSelect(c, "board_positions", { applicant_id: f.applicant }));
  rule("move a card", MEMBERS, (c, role) =>
    canUpdate(c, "board_positions", { zone: "seat", position: 1, updated_by: ownId(role) }, { applicant_id: f.applicant }),
  );
  rule("place a new card", MEMBERS, async (c) =>
    canInsert(c, "board_positions", { round_id: f.round, applicant_id: await createApplicant(f.round) }),
  );
  rule("read board_events", MEMBERS, (c) => canSelect(c, "board_events", { id: f.event }));
  rule("append own event", MEMBERS, (c, role) =>
    canInsert(c, "board_events", {
      round_id: f.round,
      applicant_id: f.applicant,
      actor_id: ownId(role),
      from_zone: "pool",
      to_zone: "seat",
      to_position: 1,
    }),
  );
  rule("append an event as someone else", NOBODY, (c) =>
    canInsert(c, "board_events", { round_id: f.round, applicant_id: f.applicant, actor_id: id.interviewerA, to_zone: "pool" }),
  );
  rule("change an event (append-only)", NOBODY, (c) => canUpdate(c, "board_events", { to_position: 2 }, { id: f.event }));
  rule("delete an event (append-only)", NOBODY, (c) => canDelete(c, "board_events", { id: f.event }));
  rule("move a card after the board is frozen", NOBODY, (c) =>
    canUpdate(c, "board_positions", { zone: "seat", position: 1 }, { applicant_id: f.frozenApplicant }),
  );
  rule("append an event after the board is frozen", NOBODY, (c, role) =>
    canInsert(c, "board_events", { round_id: f.frozenRound, applicant_id: f.frozenApplicant, actor_id: ownId(role), to_zone: "seat" }),
  );
});

describe("round_stats: members read, only the daily job writes", () => {
  rule("read", MEMBERS, (c) => canSelect(c, "round_stats", { id: f.stats }));
  rule("insert", NOBODY, (c) => canInsert(c, "round_stats", { year: 1999, applications: 0, interviews: 0, admitted: 0 }));
});

// ---------------------------------------------------------------------------
// Sight lock: interviewer B has submitted; interviewer A reads.
// Each case gets its own round so the conditions cannot leak into each other.
// ---------------------------------------------------------------------------

describe("sight lock", () => {
  async function lockedCase(roundExtra: Record<string, unknown> = {}) {
    const roundId = await createRound(roundExtra);
    const criterionId = ok(
      await db
        .from("criteria")
        .insert({ round_id: roundId, position: 1, name: "Motivation", weight: 1, scale_min: 1, scale_max: 5 })
        .select("id")
        .single(),
    ).id;
    const applicantId = await createApplicant(roundId);
    ok(await db.from("slots").insert(slotRow(roundId, await createLocation(roundId), applicantId)));
    const feedbackId = ok(
      await db
        .from("feedback")
        .insert({ applicant_id: applicantId, member_id: id.interviewerB, submitted_at: new Date().toISOString() })
        .select("id")
        .single(),
    ).id;
    ok(await db.from("feedback_scores").insert({ feedback_id: feedbackId, criterion_id: criterionId, score: 4 }));
    return { applicantId, feedbackId };
  }

  const readsEntry = (c: SupabaseClient, feedbackId: string) => canSelect(c, "feedback", { id: feedbackId });
  const readsScores = (c: SupabaseClient, feedbackId: string) => canSelect(c, "feedback_scores", { feedback_id: feedbackId });

  it("hides the partner's entry and scores from an interviewer without own submission", async () => {
    const { feedbackId } = await lockedCase();
    expect(await readsEntry(as.interviewerA, feedbackId)).toBe(false);
    expect(await readsScores(as.interviewerA, feedbackId)).toBe(false);
  });

  it("condition 1: a member who is not an interviewer reads it right away", async () => {
    const { feedbackId } = await lockedCase();
    expect(await readsEntry(as.member, feedbackId)).toBe(true);
    expect(await readsScores(as.member, feedbackId)).toBe(true);
  });

  it("condition 2: the interviewer reads it after submitting their own, not with a draft", async () => {
    const { applicantId, feedbackId } = await lockedCase();
    const own = ok(
      await as.interviewerA.from("feedback").insert({ applicant_id: applicantId, member_id: id.interviewerA }).select("id").single(),
    ).id;
    expect(await readsEntry(as.interviewerA, feedbackId)).toBe(false);

    ok(await as.interviewerA.from("feedback").update({ submitted_at: new Date().toISOString() }).eq("id", own));
    expect(await readsEntry(as.interviewerA, feedbackId)).toBe(true);
    expect(await readsScores(as.interviewerA, feedbackId)).toBe(true);
  });

  it("condition 3: the interviewer reads it once an admin lifts the lock", async () => {
    const { applicantId, feedbackId } = await lockedCase();
    ok(await as.admin.from("applicants").update({ sight_lock_lifted: true }).eq("id", applicantId));
    expect(await readsEntry(as.interviewerA, feedbackId)).toBe(true);
  });

  it("condition 4: the interviewer reads it once the selection round has started, not before", async () => {
    const future = await lockedCase({ selection_started_at: "2099-01-01T00:00:00Z" });
    expect(await readsEntry(as.interviewerA, future.feedbackId)).toBe(false);

    const started = await lockedCase({ selection_started_at: new Date(Date.now() - 60_000).toISOString() });
    expect(await readsEntry(as.interviewerA, started.feedbackId)).toBe(true);
  });

  it("shows a draft only to its author, even after the selection round has started", async () => {
    const roundId = await createRound({ selection_started_at: new Date(Date.now() - 60_000).toISOString() });
    const applicantId = await createApplicant(roundId);
    const draftId = ok(
      await db.from("feedback").insert({ applicant_id: applicantId, member_id: id.interviewerB }).select("id").single(),
    ).id;

    expect(await readsEntry(as.interviewerB, draftId)).toBe(true);
    expect(await readsEntry(as.member, draftId)).toBe(false);
    expect(await readsEntry(as.admin, draftId)).toBe(false);
  });
});
