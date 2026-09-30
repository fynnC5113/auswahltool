// Phase 6: saving a round against "auswahltool-test". Admins create and edit
// (3 questions, 4 departments, 3 weighted criteria), reorder and remove;
// members and deactivated admins may not save; items with data cannot be
// removed, and then nothing is saved.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { emptyForm, newCriterion, type RoundForm } from "./round-form";
import { loadRound, saveRound } from "./round";

const emails: string[] = [];
const roundIds: string[] = [];
const email = (prefix: string) => {
  const e = testEmail(prefix);
  emails.push(e);
  return e;
};

let asAdmin: SupabaseClient;
let asMember: SupabaseClient;
let asInactiveAdmin: SupabaseClient;
let memberId: string;

beforeAll(async () => {
  const adminEmail = email("phase6-admin");
  const memberEmail = email("phase6-member");
  const inactiveEmail = email("phase6-inactive-admin");
  await createMember(adminEmail, "admin");
  memberId = await createMember(memberEmail, "member");
  await createMember(inactiveEmail, "admin", false);
  [asAdmin, asMember, asInactiveAdmin] = await Promise.all([signIn(adminEmail), signIn(memberEmail), signIn(inactiveEmail)]);
});
afterAll(async () => {
  if (roundIds.length) await admin.from("rounds").delete().in("id", roundIds);
  await deleteUsersByEmail(emails);
});

function testRound(title = `Phase 6 ${randomUUID()}`): RoundForm {
  const k = () => randomUUID();
  return {
    ...emptyForm(2026),
    title,
    seats: "8",
    interviewMinutes: "30",
    bufferMinutes: "10",
    applicationOpensAt: "2026-10-01T00:00",
    applicationClosesAt: "2026-10-15T23:59",
    interviewsFrom: "2026-10-19",
    interviewsUntil: "2026-10-30",
    deletionDate: "2027-01-31",
    privacyNotice: "Wir speichern deine Daten bis zum Löschdatum.",
    questions: ["Warum die Law Clinic?", "Was bringst du mit?", "Wie viel Zeit hast du?"].map((text) => ({
      key: k(),
      id: null,
      text,
    })),
    departments: ["Finanzen", "Kommunikation", "Events", "IT"].map((name) => ({
      key: k(),
      id: null,
      name,
      description: `${name} in einem Satz.`,
    })),
    criteria: [
      { ...newCriterion(k()), name: "Motivation", weight: "2" },
      { ...newCriterion(k()), name: "Teamfähigkeit", weight: "1,5" },
      { ...newCriterion(k()), name: "Verfügbarkeit", weight: "1", scaleMin: "0", scaleMax: "3" },
    ],
  };
}

/** Saves as admin and returns the reloaded round (the newest one by then). */
async function create(form = testRound()): Promise<RoundForm> {
  const result = await saveRound(asAdmin, form);
  if (!("ok" in result)) throw new Error(JSON.stringify(result));
  roundIds.push(result.id);
  return reload(result.id);
}

/** loadRound returns the newest round; tests run in parallel, so read by id. */
async function reload(id: string): Promise<RoundForm> {
  const round = await loadRound(asAdmin, id);
  if (!round) throw new Error(`round ${id} not found`);
  return round;
}

async function positions(table: "questions" | "departments" | "criteria", roundId: string) {
  const { data } = await admin.from(table).select("*").eq("round_id", roundId).order("position");
  return data ?? [];
}

describe("saveRound as admin", () => {
  it("saves and loads the number of required answers; empty means all", async () => {
    const round = await create({ ...testRound(), requiredAnswers: "2" });
    expect(round.requiredAnswers).toBe("2");
    const { data } = await admin.from("rounds").select("required_answers").eq("id", round.id!).single();
    expect(data?.required_answers).toBe(2);

    const cleared = await saveRound(asAdmin, { ...round, requiredAnswers: "" });
    expect(cleared).toHaveProperty("ok");
    expect((await reload(round.id!)).requiredAnswers).toBe("");
  });

  it("creates a round with 3 questions, 4 departments and 3 weighted criteria", async () => {
    const round = await create();
    expect(round).toMatchObject({
      seats: "8",
      applicationOpensAt: "2026-10-01T00:00",
      applicationClosesAt: "2026-10-15T23:59",
      replyTo: "termin.lawclinic@law-school.de",
      mailTransport: "gmail",
    });
    expect(round.questions.map((q) => q.text)).toEqual(["Warum die Law Clinic?", "Was bringst du mit?", "Wie viel Zeit hast du?"]);
    expect(round.departments.map((d) => d.name)).toEqual(["Finanzen", "Kommunikation", "Events", "IT"]);
    expect(round.criteria.map((c) => [c.name, c.weight, c.scaleMin, c.scaleMax])).toEqual([
      ["Motivation", "2", "1", "5"],
      ["Teamfähigkeit", "1,5", "1", "5"],
      ["Verfügbarkeit", "1", "0", "3"],
    ]);
    // Stored in UTC: 01.10. 00:00 summer time is 30.09. 22:00 UTC.
    const { data } = await admin.from("rounds").select("application_opens_at").eq("id", round.id!).single();
    expect(new Date(data!.application_opens_at).toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("edits a round: rename, add, remove and reorder", async () => {
    const round = await create();
    const [q1, q2, q3] = round.questions;
    const [d1, d2, d3, d4] = round.departments;
    const [c1, c2, c3] = round.criteria;

    const result = await saveRound(asAdmin, {
      ...round,
      title: `${round.title} (bearbeitet)`,
      seats: "10",
      questions: [q3, { ...q1, text: "Warum gerade wir?" }, { key: "new", id: null, text: "Neue Frage" }],
      departments: [d4, d3, d2, d1],
      criteria: [c2, { ...c1, weight: "3" }],
    });
    expect(result).toEqual({ ok: true, id: round.id });

    const edited = await reload(round.id!);
    expect(edited.title).toBe(`${round.title} (bearbeitet)`);
    expect(edited.seats).toBe("10");
    expect(edited.questions.map((q) => q.text)).toEqual(["Wie viel Zeit hast du?", "Warum gerade wir?", "Neue Frage"]);
    // Saved items keep their id; the removed question is gone.
    expect(edited.questions.slice(0, 2).map((q) => q.id)).toEqual([q3.id, q1.id]);
    expect((await positions("questions", round.id!)).map((q) => q.id)).not.toContain(q2.id);
    expect(edited.departments.map((d) => d.name)).toEqual(["IT", "Events", "Kommunikation", "Finanzen"]);
    expect(edited.criteria.map((c) => [c.id, c.weight])).toEqual([
      [c2.id, "1,5"],
      [c1.id, "3"],
    ]);
    expect((await positions("criteria", round.id!)).map((c) => c.id)).not.toContain(c3.id);
    expect((await positions("departments", round.id!)).map((d) => d.position)).toEqual([0, 1, 2, 3]);
  });

  it("rejects invalid input without touching the database", async () => {
    const title = `Phase 6 invalid ${randomUUID()}`;
    const form = testRound(title);
    form.applicationClosesAt = "2026-09-01T12:00";
    form.criteria[0].weight = "0";
    const result = await saveRound(asAdmin, form);
    expect(result).toEqual({
      errors: {
        applicationClosesAt: "Das Ende muss nach dem Beginn liegen.",
        "criteria.0.weight": "Das Gewicht muss größer als 0 sein.",
      },
    });
    expect((await admin.from("rounds").select("id").eq("title", title)).data).toEqual([]);
  });
});

describe("removal of items that already have data", () => {
  let round: RoundForm;
  let applicantId: string;

  beforeAll(async () => {
    round = await create();
    const applicant = await admin
      .from("applicants")
      .insert({
        round_id: round.id,
        name: "Test Bewerberin",
        email: testEmail("phase6-applicant"),
        cohort: "2025",
        token_hash: randomUUID(),
      })
      .select("id")
      .single();
    applicantId = applicant.data!.id;
    await admin.from("answers").insert({ applicant_id: applicantId, question_id: round.questions[0].id, text: "Antwort" });
    await admin.from("applicant_departments").insert({ applicant_id: applicantId, department_id: round.departments[0].id });
    // A draft by another member: the admin cannot see it (sight lock), it
    // must block the removal all the same.
    const feedback = await admin
      .from("feedback")
      .insert({ applicant_id: applicantId, member_id: memberId })
      .select("id")
      .single();
    await admin.from("feedback_scores").insert({ feedback_id: feedback.data!.id, criterion_id: round.criteria[0].id, score: 3 });
  });

  it("the admin cannot see the other member's draft score", async () => {
    const { data } = await asAdmin.from("feedback_scores").select("id").eq("criterion_id", round.criteria[0].id);
    expect(data).toEqual([]);
  });

  it("is refused for a question, a department and a criterion, and nothing is saved", async () => {
    const result = await saveRound(asAdmin, {
      ...round,
      title: "darf nicht gespeichert werden",
      questions: round.questions.slice(1),
      departments: round.departments.slice(1),
      criteria: round.criteria.slice(1),
    });
    expect(result).toHaveProperty("errors.form");
    expect("inUse" in result && [...result.inUse!].sort()).toEqual(
      [round.questions[0].id, round.departments[0].id, round.criteria[0].id].sort(),
    );

    const after = await reload(round.id!);
    expect(after.title).toBe(round.title);
    expect(after.questions).toHaveLength(3);
    expect(after.departments).toHaveLength(4);
    expect(after.criteria).toHaveLength(3);
    expect((await admin.from("answers").select("id").eq("applicant_id", applicantId)).data).toHaveLength(1);
    expect((await admin.from("feedback_scores").select("id").eq("criterion_id", round.criteria[0].id)).data).toHaveLength(1);
  });

  it("renaming and reordering those items is still allowed", async () => {
    const [q1, ...rest] = round.questions;
    const result = await saveRound(asAdmin, {
      ...round,
      questions: [...rest, { ...q1, text: "Umbenannt" }],
      criteria: [...round.criteria].reverse(),
    });
    expect(result).toEqual({ ok: true, id: round.id });
    const after = await reload(round.id!);
    expect(after.questions.at(-1)).toMatchObject({ id: q1.id, text: "Umbenannt" });
    expect(after.criteria.at(-1)?.id).toBe(round.criteria[0].id);
  });

  it("the scale of a criterion with scores cannot change; weight and name can", async () => {
    const current = await reload(round.id!);
    const index = current.criteria.findIndex((c) => c.id === round.criteria[0].id);
    const criteria = current.criteria.map((c, i) => (i === index ? { ...c, scaleMax: "7" } : c));
    expect(await saveRound(asAdmin, { ...current, criteria })).toEqual({
      errors: { [`criteria.${index}.scaleMax`]: "Die Skala lässt sich nicht mehr ändern, weil es schon Bewertungen gibt." },
    });

    const renamed = current.criteria.map((c, i) => (i === index ? { ...c, name: "Neu benannt", weight: "4" } : c));
    expect(await saveRound(asAdmin, { ...current, criteria: renamed })).toEqual({ ok: true, id: round.id });
    expect((await reload(round.id!)).criteria[index]).toMatchObject({ name: "Neu benannt", weight: "4", scaleMax: "5" });
  });

  it("the scale of a criterion without scores can change", async () => {
    const current = await reload(round.id!);
    const index = current.criteria.findIndex((c) => c.id === round.criteria[1].id);
    const criteria = current.criteria.map((c, i) => (i === index ? { ...c, scaleMin: "0", scaleMax: "10" } : c));
    expect(await saveRound(asAdmin, { ...current, criteria })).toEqual({ ok: true, id: round.id });
    expect((await reload(round.id!)).criteria[index]).toMatchObject({ scaleMin: "0", scaleMax: "10" });
  });

  it("items without data can still be removed", async () => {
    const current = await reload(round.id!);
    const result = await saveRound(asAdmin, { ...current, departments: current.departments.slice(0, 1) });
    expect(result).toEqual({ ok: true, id: round.id });
    expect((await reload(round.id!)).departments.map((d) => d.id)).toEqual([round.departments[0].id]);
  });
});

describe("saveRound without admin rights", () => {
  it.each([
    ["member", () => asMember],
    ["deactivated admin", () => asInactiveAdmin],
  ])("%s may not create a round", async (_, as) => {
    const title = `Phase 6 denied ${randomUUID()}`;
    expect(await saveRound(as(), testRound(title))).toEqual({ errors: { form: "Das dürfen nur Admins." } });
    expect((await admin.from("rounds").select("id").eq("title", title)).data).toEqual([]);
  });

  it("member may not edit a round", async () => {
    const round = await create();
    expect(await saveRound(asMember, { ...round, title: "vom Mitglied" })).toEqual({
      errors: { form: "Das dürfen nur Admins." },
    });
    expect((await reload(round.id!)).title).toBe(round.title);
  });
});
