// Phase 14: feedback against "auswahltool-test". Tests run in order: the
// selection round and the freeze apply to the whole test round.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { hashToken, createToken } from "./applicant-token";
import {
  liftSightLock,
  loadApplicantFeedback,
  loadFeedbackForm,
  loadMissingFeedback,
  loadMyInterviews,
  saveFeedback,
  startSelection,
  stopSelection,
} from "./feedback";
import { OVERALL, type FeedbackInput } from "./feedback-rules";

const emails: string[] = [];
const ids: Record<string, string> = {};
const as: Record<string, SupabaseClient> = {};
let roundId: string;
let criteria: string[];
/** P1 lock + lift, P2 selection start, P3 no-show, P4 future interview */
const people: Record<string, string> = {};
const slots: Record<string, string> = {};

const minutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function complete(tag: string): FeedbackInput {
  return {
    overall: `Gesamteindruck ${tag}`,
    scores: [
      { criterionId: criteria[0], score: 7, text: `Begründung 1 ${tag}` },
      { criterionId: criteria[1], score: 4, text: `Begründung 2 ${tag}` },
    ],
  };
}

async function visibleAuthors(client: SupabaseClient, applicantId: string) {
  const fb = await loadApplicantFeedback(client, applicantId, roundId);
  return fb.entries.map((e) => e.memberId).sort();
}

beforeAll(async () => {
  for (const [key, role] of [["admin", "admin"], ["a", "member"], ["b", "member"], ["c", "member"]] as const) {
    const email = testEmail(`phase14-${key}`);
    emails.push(email);
    ids[key] = await createMember(email, role);
    await admin.from("team_members").update({ name: `Phase14 ${key}` }).eq("id", ids[key]);
    as[key] = await signIn(email);
  }

  const round = await admin
    .from("rounds")
    .insert({
      year: 2026,
      title: `Phase 14 ${randomUUID()}`,
      seats: 8,
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

  const crit = await admin
    .from("criteria")
    .insert([
      { round_id: roundId, position: 0, name: "Sympathie", description: "", weight: 1, scale_min: 1, scale_max: 10 },
      { round_id: roundId, position: 1, name: "Teamfit", description: "", weight: 2, scale_min: 1, scale_max: 5 },
    ])
    .select("id, position");
  if (crit.error) throw new Error(crit.error.message);
  criteria = crit.data.sort((x, y) => x.position - y.position).map((c) => c.id);

  const location = await admin.from("locations").insert({ round_id: roundId, name: "0.23", is_default: true }).select("id").single();
  if (location.error) throw new Error(location.error.message);

  // Past interviews end before now; P4 starts in the future. 60 minutes apart.
  const plan = { P1: -300, P2: -240, P3: -180, P4: 600 } as const;
  for (const [name, start] of Object.entries(plan)) {
    const applicant = await admin
      .from("applicants")
      .insert({
        round_id: roundId,
        name: `Phase14 ${name}`,
        email: `${name.toLowerCase()}-${randomUUID()}@example.invalid`,
        cohort: "2025",
        token_hash: hashToken(createToken()),
        status: name === "P3" ? "no_show" : "active",
      })
      .select("id")
      .single();
    if (applicant.error) throw new Error(applicant.error.message);
    people[name] = applicant.data.id;
    const slot = await admin
      .from("slots")
      .insert({
        round_id: roundId,
        location_id: location.data.id,
        starts_at: minutes(start),
        interview_ends_at: minutes(start + 30),
        ends_at: minutes(start + 45),
        interviewer_a: ids.a,
        interviewer_b: ids.b,
        status: "confirmed",
        applicant_id: applicant.data.id,
        booked_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (slot.error) throw new Error(slot.error.message);
    slots[name] = slot.data.id;
  }
}, 60_000);

afterAll(async () => {
  if (roundId) await admin.from("rounds").delete().eq("id", roundId);
  await deleteUsersByEmail(emails);
});

describe("Meine Gespräche and the form", () => {
  it("lists the interviewer's own interviews with partner and state", async () => {
    const mine = await loadMyInterviews(as.a, roundId);
    expect(mine?.interviews.map((i) => i.slotId)).toEqual([slots.P1, slots.P2, slots.P3, slots.P4]);
    expect(mine?.interviews[0]).toMatchObject({ partner: "Phase14 b", own: "none", noShow: false, location: "Raum 0.23" });
    expect(mine?.interviews[2].noShow).toBe(true);
    expect((await loadMyInterviews(as.c, roundId))?.interviews).toEqual([]);
  });

  it("opens the form only for the interviewers", async () => {
    expect((await loadFeedbackForm(as.a, slots.P1))?.criteria.map((c) => c.id)).toEqual(criteria);
    expect(await loadFeedbackForm(as.c, slots.P1)).toBeNull();
  });
});

describe("saving", () => {
  it("keeps a draft visible only to its author", async () => {
    const draft: FeedbackInput = { overall: "", scores: [{ criterionId: criteria[0], score: 6, text: "" }] };
    expect(await saveFeedback(as.a, people.P1, draft, false)).toEqual({ ok: true, submittedAt: null });
    expect(await visibleAuthors(as.a, people.P1)).toEqual([ids.a]);
    expect(await visibleAuthors(as.b, people.P1)).toEqual([]);
    expect(await visibleAuthors(as.c, people.P1)).toEqual([]);
    expect(await visibleAuthors(as.admin, people.P1)).toEqual([]);
    const form = await loadFeedbackForm(as.a, slots.P1);
    expect(form?.input.scores[0]).toEqual({ criterionId: criteria[0], score: 6, text: "" });
  });

  it("refuses an incomplete submission and names what is missing", async () => {
    const result = await saveFeedback(as.a, people.P1, { overall: "", scores: [{ criterionId: criteria[0], score: 6, text: "x" }] }, true);
    expect(result).toMatchObject({ error: "Bitte fülle die markierten Felder aus." });
    expect("missing" in result && result.missing?.sort()).toEqual([criteria[1], OVERALL].sort());
  });

  it("refuses a third member, a future interview and direct writes", async () => {
    expect(await saveFeedback(as.c, people.P1, complete("c"), true)).toEqual({
      error: "Du bist für dieses Gespräch nicht (mehr) eingeteilt.",
    });
    expect(await saveFeedback(as.a, people.P4, complete("a"), false)).toEqual({
      error: "Feedback kannst du ab Gesprächsbeginn eintragen.",
    });
    const direct = await as.c.from("feedback").insert({ applicant_id: people.P1, member_id: ids.c, submitted_at: new Date().toISOString() });
    expect(direct.error?.code).toBe("42501");
    const update = await as.a.from("feedback").update({ submitted_at: new Date().toISOString() }).eq("applicant_id", people.P1);
    expect(update.error?.code).toBe("42501");
  });
});

describe("sight lock", () => {
  it("B's submitted entry: hidden from A until A submits, visible to a third member at once", async () => {
    const b = await saveFeedback(as.b, people.P1, complete("b"), true);
    expect(b).toMatchObject({ ok: true });
    expect(await visibleAuthors(as.a, people.P1)).toEqual([ids.a]);
    expect(await visibleAuthors(as.c, people.P1)).toEqual([ids.b]);

    const a = await saveFeedback(as.a, people.P1, complete("a"), true);
    expect(a).toMatchObject({ ok: true });
    expect(await visibleAuthors(as.a, people.P1)).toEqual([ids.a, ids.b].sort());
    const entry = (await loadApplicantFeedback(as.c, people.P1, roundId)).entries.find((e) => e.memberId === ids.a);
    expect(entry?.scores).toEqual(complete("a").scores);
    expect(entry?.overall).toBe("Gesamteindruck a");
  });

  it("stays submitted and complete: later saves need every field", async () => {
    const blank = complete("a2");
    blank.scores[1].text = " ";
    const result = await saveFeedback(as.a, people.P1, blank, false);
    expect(result).toMatchObject({ error: "Nicht gespeichert: Ein abgegebenes Feedback muss vollständig bleiben." });
    const changed = await saveFeedback(as.a, people.P1, complete("a3"), false);
    expect(changed).toMatchObject({ ok: true });
    expect("submittedAt" in changed && changed.submittedAt).toBeTruthy();
  });

  it("lifting the lock (admin only) shows the partner's entry", async () => {
    // P2: B submits, A has nothing yet.
    expect(await saveFeedback(as.b, people.P2, complete("b"), true)).toMatchObject({ ok: true });
    expect(await visibleAuthors(as.a, people.P2)).toEqual([]);
    expect(await liftSightLock(as.a, people.P2)).toEqual({ error: "Das dürfen nur Admins." });
    expect(await liftSightLock(as.admin, people.P2)).toEqual({ ok: true });
    expect(await visibleAuthors(as.a, people.P2)).toEqual([ids.b]);
  });
});

describe("missing feedback", () => {
  it("counts ended interviews without submission, skips no-shows and future ones", async () => {
    const { count, rows } = await loadMissingFeedback(as.admin, roundId);
    // P1 complete; P2: A missing; P3 no-show; P4 not over yet.
    expect(count).toBe(1);
    expect(rows).toEqual([
      expect.objectContaining({ applicantId: people.P2, lifted: true, missing: [{ name: "Phase14 a", draft: false }] }),
    ]);
  });

  it("marks a draft", async () => {
    await saveFeedback(as.a, people.P2, { overall: "halb", scores: [] }, false);
    const { rows } = await loadMissingFeedback(as.c, roundId);
    expect(rows[0].missing).toEqual([{ name: "Phase14 a", draft: true }]);
  });
});

describe("selection round and freeze", () => {
  it("starting the selection round (admin only, once) opens every submitted entry", async () => {
    // P3 (no-show): B submits anyway; A has no entry and would be locked.
    expect(await saveFeedback(as.b, people.P3, complete("b"), true)).toMatchObject({ ok: true });
    expect(await visibleAuthors(as.a, people.P3)).toEqual([]);

    expect(await startSelection(as.b, roundId)).toEqual({ error: "Das dürfen nur Admins." });
    expect(await startSelection(as.admin, roundId)).toEqual({ ok: true });
    expect(await startSelection(as.admin, roundId)).toEqual({ error: "Die Auswahlrunde läuft schon." });
    expect(await visibleAuthors(as.a, people.P3)).toEqual([ids.b]);
    // Drafts stay private.
    expect(await visibleAuthors(as.b, people.P2)).toEqual([ids.b]);
  });

  it("taking the selection round back (admin only) locks again; lifted locks stay lifted", async () => {
    expect(await stopSelection(as.a, roundId)).toEqual({ error: "Das dürfen nur Admins." });
    expect(await stopSelection(as.admin, roundId)).toEqual({ ok: true });
    expect(await visibleAuthors(as.a, people.P3)).toEqual([]);
    // P2 was lifted one by one.
    expect(await visibleAuthors(as.a, people.P2)).toContain(ids.b);
    expect(await stopSelection(as.admin, roundId)).toMatchObject({ error: expect.stringContaining("läuft nicht") });
    expect(await startSelection(as.admin, roundId)).toEqual({ ok: true });
  });

  it("no changes after the board is frozen", async () => {
    await admin.from("rounds").update({ board_frozen_at: new Date().toISOString() }).eq("id", roundId);
    expect(await saveFeedback(as.a, people.P1, complete("a4"), false)).toEqual({
      error: "Das Board ist eingefroren. Feedback lässt sich nicht mehr ändern.",
    });
    expect((await loadFeedbackForm(as.a, slots.P1))?.frozen).toBe(true);
    expect(await stopSelection(as.admin, roundId)).toMatchObject({ error: expect.stringContaining("eingefroren") });
  });
});

describe("applicants and anonymous visitors", () => {
  it("a client without login reads no feedback and cannot save any", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const read = await anon.from("feedback").select("id").eq("applicant_id", people.P1);
    expect(read.data ?? []).toEqual([]);
    const scores = await anon.from("feedback_scores").select("id");
    expect(scores.data ?? []).toEqual([]);
    const rpc = await anon.rpc("save_feedback", { p_applicant_id: people.P1, p_overall: "x", p_scores: [], p_submit: false });
    expect(rpc.error).not.toBeNull();
    const progress = await anon.rpc("feedback_progress", { p_round_id: roundId });
    expect(progress.error).not.toBeNull();
  });
});
