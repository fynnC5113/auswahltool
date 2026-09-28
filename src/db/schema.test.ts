// Phase 2: database rules, tested against the Supabase project "auswahltool-test".
// Runs with the secret key (bypasses RLS); RLS itself is tested in phase 3.
// Every test works inside its own throwaway round and cleans up afterwards.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
}

const db = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// Postgres error codes
const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";

const memberIds: string[] = [];
const roundIds: string[] = [];
const cvPaths: string[] = [];

/** Unwraps a Supabase result or fails the test with the database message. */
function ok<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}

async function createMember(): Promise<string> {
  const email = `phase2-${randomUUID()}@example.invalid`;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message ?? "createUser returned no user");
  const id = data.user.id;
  memberIds.push(id);
  ok(await db.from("team_members").insert({ id, email, name: "Testmitglied" }));
  return id;
}

async function createRound(): Promise<string> {
  const round = ok(
    await db
      .from("rounds")
      .insert({
        year: 2026,
        title: "Phase-2-Testrunde",
        seats: 10,
        interview_minutes: 30,
        buffer_minutes: 15,
        application_opens_at: "2026-10-01T00:00:00+02:00",
        application_closes_at: "2026-10-15T23:59:00+02:00",
        interviews_from: "2026-10-20",
        interviews_until: "2026-10-31",
        deletion_date: "2026-12-31",
        reply_to: "test@example.invalid",
      })
      .select("id")
      .single(),
  );
  roundIds.push(round.id);
  return round.id;
}

async function createLocation(roundId: string, name = "Raum 1"): Promise<string> {
  return ok(await db.from("locations").insert({ round_id: roundId, name }).select("id").single()).id;
}

async function createApplicant(roundId: string, email = `${randomUUID()}@example.invalid`) {
  return db
    .from("applicants")
    .insert({ round_id: roundId, name: "Test Bewerber", email, cohort: "2025", token_hash: randomUUID() })
    .select("id")
    .single();
}

/** Slot of 30 min interview + 15 min buffer starting at the given Berlin time on 20.10.2026. */
function slotAt(roundId: string, locationId: string, a: string, b: string, time: string) {
  const start = new Date(`2026-10-20T${time}:00+02:00`);
  return {
    round_id: roundId,
    location_id: locationId,
    starts_at: start.toISOString(),
    interview_ends_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
    ends_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
    interviewer_a: a,
    interviewer_b: b,
    status: "confirmed",
  };
}

let memberA: string;
let memberB: string;

beforeAll(async () => {
  memberA = await createMember();
  memberB = await createMember();
});

afterAll(async () => {
  if (cvPaths.length) await db.storage.from("cv").remove(cvPaths);
  if (roundIds.length) await db.from("rounds").delete().in("id", roundIds);
  // Deleting the auth user cascades to team_members.
  for (const id of memberIds) await db.auth.admin.deleteUser(id);
});

describe("slots", () => {
  it("rejects a second booking for the same applicant", async () => {
    const roundId = await createRound();
    const loc = await createLocation(roundId);
    const applicant = ok(await createApplicant(roundId));
    const [s1, s2] = ok(
      await db
        .from("slots")
        .insert([slotAt(roundId, loc, memberA, memberB, "10:00"), slotAt(roundId, loc, memberA, memberB, "11:00")])
        .select("id"),
    );

    ok(await db.from("slots").update({ applicant_id: applicant.id }).eq("id", s1.id));
    const second = await db.from("slots").update({ applicant_id: applicant.id }).eq("id", s2.id);

    expect(second.error?.code).toBe(UNIQUE_VIOLATION);
  });

  it("rejects overlapping slots at the same location, buffer included", async () => {
    const roundId = await createRound();
    const loc = await createLocation(roundId);
    ok(await db.from("slots").insert(slotAt(roundId, loc, memberA, memberB, "10:00")));

    // 10:00 slot runs until 10:45 including buffer; 10:30 overlaps only the buffer.
    const overlap = await db.from("slots").insert(slotAt(roundId, loc, memberA, memberB, "10:30"));

    expect(overlap.error?.code).toBe(EXCLUSION_VIOLATION);
  });

  it("allows back-to-back slots and the same time at another location", async () => {
    const roundId = await createRound();
    const loc1 = await createLocation(roundId, "Raum 1");
    const loc2 = await createLocation(roundId, "Raum 2");
    ok(await db.from("slots").insert(slotAt(roundId, loc1, memberA, memberB, "10:00")));

    const backToBack = await db.from("slots").insert(slotAt(roundId, loc1, memberA, memberB, "10:45"));
    const otherRoom = await db.from("slots").insert(slotAt(roundId, loc2, memberA, memberB, "10:00"));

    expect(backToBack.error).toBeNull();
    expect(otherRoom.error).toBeNull();
  });
});

describe("applicants", () => {
  it("rejects the same email twice in one round, ignoring case", async () => {
    const roundId = await createRound();
    ok(await createApplicant(roundId, "Anna.Muster@example.invalid"));

    const duplicate = await createApplicant(roundId, "anna.muster@EXAMPLE.invalid");

    expect(duplicate.error?.code).toBe(UNIQUE_VIOLATION);
  });

  it("allows the same email in another round", async () => {
    ok(await createApplicant(await createRound(), "same@example.invalid"));

    const otherRound = await createApplicant(await createRound(), "same@example.invalid");

    expect(otherRound.error).toBeNull();
  });
});

describe("deleting a round", () => {
  it("removes every dependent row and keeps team members", async () => {
    const roundId = await createRound();
    const question = ok(await db.from("questions").insert({ round_id: roundId, position: 1, text: "Warum?" }).select("id").single());
    const department = ok(await db.from("departments").insert({ round_id: roundId, position: 1, name: "Presse" }).select("id").single());
    const criterion = ok(
      await db
        .from("criteria")
        .insert({ round_id: roundId, position: 1, name: "Motivation", weight: 1, scale_min: 1, scale_max: 5 })
        .select("id")
        .single(),
    );
    const applicant = ok(await createApplicant(roundId));
    const loc = await createLocation(roundId);
    ok(await db.from("answers").insert({ applicant_id: applicant.id, question_id: question.id, text: "Darum." }));
    ok(await db.from("applicant_departments").insert({ applicant_id: applicant.id, department_id: department.id }));
    ok(
      await db.from("blocked_times").insert({
        location_id: loc,
        starts_at: "2026-10-21T08:00:00Z",
        ends_at: "2026-10-21T09:00:00Z",
      }),
    );
    ok(
      await db.from("availabilities").insert({
        round_id: roundId,
        member_id: memberA,
        starts_at: "2026-10-20T08:00:00Z",
        ends_at: "2026-10-20T08:15:00Z",
      }),
    );
    ok(await db.from("member_round_settings").insert({ round_id: roundId, member_id: memberA, max_interviews: 5 }));
    ok(await db.from("slots").insert({ ...slotAt(roundId, loc, memberA, memberB, "10:00"), applicant_id: applicant.id }));
    ok(await db.from("conflicts").insert({ applicant_id: applicant.id, member_id: memberB }));
    const feedback = ok(await db.from("feedback").insert({ applicant_id: applicant.id, member_id: memberA }).select("id").single());
    ok(await db.from("feedback_scores").insert({ feedback_id: feedback.id, criterion_id: criterion.id, score: 4 }));
    ok(await db.from("board_positions").insert({ round_id: roundId, applicant_id: applicant.id }));
    ok(
      await db.from("board_events").insert({
        round_id: roundId,
        applicant_id: applicant.id,
        actor_id: memberA,
        from_zone: "pool",
        to_zone: "seat",
        to_position: 1,
      }),
    );

    ok(await db.from("rounds").delete().eq("id", roundId));

    const byRound = ["questions", "departments", "criteria", "applicants", "locations", "availabilities", "member_round_settings", "slots", "board_positions", "board_events"];
    for (const table of byRound) {
      const { count } = await db.from(table).select("*", { count: "exact", head: true }).eq("round_id", roundId);
      expect(count, table).toBe(0);
    }
    const byApplicant = ["answers", "applicant_departments", "conflicts", "feedback"];
    for (const table of byApplicant) {
      const { count } = await db.from(table).select("*", { count: "exact", head: true }).eq("applicant_id", applicant.id);
      expect(count, table).toBe(0);
    }
    const { count: blocked } = await db.from("blocked_times").select("*", { count: "exact", head: true }).eq("location_id", loc);
    expect(blocked, "blocked_times").toBe(0);
    const { count: scores } = await db.from("feedback_scores").select("*", { count: "exact", head: true }).eq("feedback_id", feedback.id);
    expect(scores, "feedback_scores").toBe(0);

    const { count: members } = await db.from("team_members").select("*", { count: "exact", head: true }).in("id", [memberA, memberB]);
    expect(members).toBe(2);
  });
});

describe("feedback_scores", () => {
  it("rejects a score outside the criterion's scale", async () => {
    const roundId = await createRound();
    const criterion = ok(
      await db
        .from("criteria")
        .insert({ round_id: roundId, position: 1, name: "Motivation", weight: 1, scale_min: 1, scale_max: 5 })
        .select("id")
        .single(),
    );
    const applicant = ok(await createApplicant(roundId));
    const feedback = ok(await db.from("feedback").insert({ applicant_id: applicant.id, member_id: memberA }).select("id").single());

    const tooHigh = await db.from("feedback_scores").insert({ feedback_id: feedback.id, criterion_id: criterion.id, score: 6 });

    expect(tooHigh.error).not.toBeNull();
  });
});

describe("bucket cv", () => {
  const folder = `phase2-test-${randomUUID()}`;
  const pdfHeader = "%PDF-1.4\n";
  // The Blob's own type is what reaches the server; an untyped Blob arrives
  // as application/octet-stream, so each Blob carries its type explicitly.
  const pdf = (...parts: BlobPart[]) => new Blob(parts, { type: "application/pdf" });

  it("accepts a small PDF", async () => {
    const path = `${folder}/ok.pdf`;
    cvPaths.push(path);
    const { error } = await db.storage.from("cv").upload(path, pdf(pdfHeader), { contentType: "application/pdf" });

    expect(error).toBeNull();
  });

  it("rejects a file that is not a PDF", async () => {
    const path = `${folder}/note.txt`;
    cvPaths.push(path);
    const text = new Blob(["hello"], { type: "text/plain" });
    const { error } = await db.storage.from("cv").upload(path, text, { contentType: "text/plain" });

    expect(error).toMatchObject({ code: "InvalidMimeType" });
  });

  it("rejects a PDF over 10 MB", async () => {
    const path = `${folder}/big.pdf`;
    cvPaths.push(path);
    const big = pdf(pdfHeader, new Uint8Array(10 * 1024 * 1024));
    const { error } = await db.storage.from("cv").upload(path, big, { contentType: "application/pdf" });

    // Must fail for its size, not for its type.
    expect(error).toMatchObject({ code: "EntityTooLarge" });
  });

  it("is private", async () => {
    const bucket = ok(await db.storage.getBucket("cv"));
    expect(bucket.public).toBe(false);
  });
});
