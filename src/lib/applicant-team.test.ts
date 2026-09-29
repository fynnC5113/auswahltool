// Phase 13: applications in the team against "auswahltool-test". Mails are
// collected, never sent.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { NO_FILTER, matchesFilter } from "./applicant-filter";
import { createToken, hashToken } from "./applicant-token";
import { cvUrl, deleteApplicantAsAdmin, loadTeamApplicant, loadTeamList, setConflict, setStatus } from "./applicant-team";
import { findApplicant } from "./application";
import { dayCells } from "./availability-grid";
import { loadBooking } from "./booking";
import type { Mail } from "./mail/send";
import { loadOverview } from "./overview";

const emails: string[] = [];
let sent: Mail[] = [];
const send = async (mail: Mail) => {
  sent.push(mail);
  return "test";
};

let roundId: string;
let questionIds: string[];
let departmentIds: string[];
/** admin, m1, m2, m3 */
const ids: Record<string, string> = {};
const mails: Record<string, string> = {};
const sessions: Record<string, SupabaseClient> = {};
/** X: no slot; Y: booked by m1 and m2 */
const people: Record<string, { id: string; token: string }> = {};
const slots: Record<string, string> = {};

const iso = (berlin: string) => new Date(berlin).toISOString();
const pdf = (text: string) => new Blob([`%PDF-1.4\n${text}`], { type: "application/pdf" });

async function files(applicantId: string) {
  const { data, error } = await admin.storage.from("cv").list(roundId, { search: applicantId });
  if (error) throw new Error(error.message);
  return data.map((f) => f.name);
}

beforeAll(async () => {
  for (const [key, role] of [["admin", "admin"], ["m1", "member"], ["m2", "member"], ["m3", "member"]] as const) {
    mails[key] = testEmail(`phase13-${key}`);
    emails.push(mails[key]);
    ids[key] = await createMember(mails[key], role);
    await admin.from("team_members").update({ name: `Phase13 ${key}` }).eq("id", ids[key]);
    sessions[key] = await signIn(mails[key]);
  }

  const round = await admin
    .from("rounds")
    .insert({
      year: 2026,
      title: `Phase 13 ${randomUUID()}`,
      seats: 8,
      interview_minutes: 30,
      buffer_minutes: 15,
      rebook_hours_before: 24,
      application_opens_at: "2026-09-01T00:00:00Z",
      application_closes_at: "2026-10-15T00:00:00Z",
      interviews_from: "2026-10-20",
      interviews_until: "2026-10-21",
      deletion_date: "2026-12-31",
      reply_to: "test@example.invalid",
    })
    .select("id")
    .single();
  if (round.error) throw new Error(round.error.message);
  roundId = round.data.id;

  const questions = await admin
    .from("questions")
    .insert([
      { round_id: roundId, position: 0, text: "Warum das Orga-Team?" },
      { round_id: roundId, position: 1, text: "Was bringst du mit?" },
    ])
    .select("id, position");
  if (questions.error) throw new Error(questions.error.message);
  questionIds = questions.data.sort((a, b) => a.position - b.position).map((q) => q.id);
  const departments = await admin
    .from("departments")
    .insert([
      { round_id: roundId, position: 0, name: "Veranstaltungen", description: "" },
      { round_id: roundId, position: 1, name: "Finanzen", description: "" },
    ])
    .select("id, position");
  if (departments.error) throw new Error(departments.error.message);
  departmentIds = departments.data.sort((a, b) => a.position - b.position).map((d) => d.id);

  const cells = dayCells("2026-10-20").filter((c) => c.label >= "10:00" && c.label < "13:00");
  const available = await admin
    .from("availabilities")
    .insert(Object.values(ids).flatMap((member_id) => cells.map((c) => ({ round_id: roundId, member_id, starts_at: c.start, ends_at: c.end }))));
  if (available.error) throw new Error(available.error.message);

  const location = await admin.from("locations").insert({ round_id: roundId, name: "0.23", is_default: true }).select("id").single();
  if (location.error) throw new Error(location.error.message);

  const answers = {
    X: ["Ich habe beim Schulfest die Kasse gemacht.", "Excel und Geduld."],
    Y: ["Mandanten sollen schneller Termine bekommen.", "Buchhaltung aus dem Ruderverein."],
  };
  for (const name of ["X", "Y"] as const) {
    const token = createToken();
    const { data, error } = await admin
      .from("applicants")
      .insert({
        round_id: roundId,
        name: `Phase13 ${name}`,
        email: `${name.toLowerCase()}-${randomUUID()}@example.invalid`,
        cohort: name === "X" ? "2025" : "2024",
        token_hash: hashToken(token),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    people[name] = { id: data.id, token };
    const path = `${roundId}/${data.id}.pdf`;
    const up = await admin.storage.from("cv").upload(path, pdf(name), { contentType: "application/pdf" });
    if (up.error) throw new Error(up.error.message);
    await admin.from("applicants").update({ cv_path: path }).eq("id", data.id);
    await admin.from("answers").insert(answers[name].map((text, i) => ({ applicant_id: data.id, question_id: questionIds[i], text })));
    await admin.from("applicant_departments").insert({ applicant_id: data.id, department_id: departmentIds[name === "X" ? 0 : 1] });
  }
  // A leftover from an edit (new name, TECH_DESIGN 6.1): the deletion takes it too.
  const extra = await admin.storage.from("cv").upload(`${roundId}/${people.Y.id}-${randomUUID()}.pdf`, pdf("alt"), { contentType: "application/pdf" });
  if (extra.error) throw new Error(extra.error.message);

  const slot = (start: string, extra: Record<string, unknown>) => {
    const s = Date.parse(iso(start));
    return {
      round_id: roundId,
      location_id: location.data.id,
      starts_at: new Date(s).toISOString(),
      interview_ends_at: new Date(s + 30 * 60_000).toISOString(),
      ends_at: new Date(s + 45 * 60_000).toISOString(),
      status: "confirmed",
      ...extra,
    };
  };
  const created = await admin
    .from("slots")
    .insert([
      slot("2026-10-20T10:00:00+02:00", { applicant_id: people.Y.id, interviewer_a: ids.m1, interviewer_b: ids.m2, booked_at: new Date().toISOString() }),
      slot("2026-10-20T10:45:00+02:00", {}),
      slot("2026-10-20T11:30:00+02:00", { interviewer_a: ids.m1, interviewer_b: ids.m3 }),
    ])
    .select("id, starts_at");
  if (created.error) throw new Error(created.error.message);
  const find = (start: string) => created.data.find((s) => Date.parse(s.starts_at) === Date.parse(iso(start)))!.id;
  slots.booked = find("2026-10-20T10:00:00+02:00");
  slots.open = find("2026-10-20T10:45:00+02:00");
  slots.fixed = find("2026-10-20T11:30:00+02:00");
});

afterAll(async () => {
  if (roundId) {
    const { data } = await admin.storage.from("cv").list(roundId, { limit: 1000 });
    if (data?.length) await admin.storage.from("cv").remove(data.map((f) => `${roundId}/${f.name}`));
    await admin.from("rounds").delete().eq("id", roundId);
  }
  await deleteUsersByEmail(emails);
});

beforeEach(() => {
  sent = [];
});

describe("list and detail", () => {
  it("every member sees all applications; the search finds text from the answers", async () => {
    const list = (await loadTeamList(sessions.m1, roundId))!;
    expect(list.items.map((i) => i.name)).toEqual(["Phase13 X", "Phase13 Y"]);
    const x = list.items.find((i) => i.id === people.X.id)!;
    expect(x.answers).toEqual(["Ich habe beim Schulfest die Kasse gemacht.", "Excel und Geduld."]);
    expect(x.departments).toEqual(["Veranstaltungen"]);
    expect(list.items.find((i) => i.id === people.Y.id)!.slotStartsAt).not.toBeNull();

    const found = (query: string) => list.items.filter((i) => matchesFilter(i, { ...NO_FILTER, query })).map((i) => i.name);
    expect(found("schulfest")).toEqual(["Phase13 X"]);
    expect(found("ruderverein")).toEqual(["Phase13 Y"]);
    expect(list.items.filter((i) => matchesFilter(i, { ...NO_FILTER, department: departmentIds[1] })).map((i) => i.name)).toEqual(["Phase13 Y"]);
  });

  it("the detail shows answers in question order, slot, room and interviewers", async () => {
    const y = (await loadTeamApplicant(sessions.m3, people.Y.id))!;
    expect(y.answers).toEqual([
      { question: "Warum das Orga-Team?", text: "Mandanten sollen schneller Termine bekommen." },
      { question: "Was bringst du mit?", text: "Buchhaltung aus dem Ruderverein." },
    ]);
    expect(y.slot!.location).toBe("Raum 0.23");
    expect(y.slot!.interviewers.map((m) => m.name).sort()).toEqual(["Phase13 m1", "Phase13 m2"]);
    expect(await loadTeamApplicant(sessions.m3, randomUUID())).toBeNull();
    expect(await loadTeamApplicant(sessions.m3, "kein-uuid")).toBeNull();
  });
});

describe("CV", () => {
  it("the link opens the PDF, an expired link does not", async () => {
    const url = (await cvUrl(sessions.m2, people.X.id))!;
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    expect((await res.text()).startsWith("%PDF-")).toBe(true);

    const short = (await cvUrl(sessions.m2, people.X.id, 1))!;
    await new Promise((r) => setTimeout(r, 2500));
    const expired = await fetch(short);
    expect(expired.ok).toBe(false);
  });
});

describe("conflict of interest", () => {
  it("is visible to others and hides the member's slots from this applicant", async () => {
    const x = (await findApplicant(admin, people.X.token))!;
    expect((await loadBooking(admin, x)).offers.map((o) => o.id)).toContain(slots.fixed);

    expect(await setConflict(sessions.m1, people.X.id, true)).toEqual({ ok: true });
    // Twice is fine.
    expect(await setConflict(sessions.m1, people.X.id, true)).toEqual({ ok: true });
    const seen = (await loadTeamApplicant(sessions.m2, people.X.id))!;
    expect(seen.conflicts.map((c) => c.name)).toEqual(["Phase13 m1"]);
    expect((await loadTeamList(sessions.m3, roundId))!.items.find((i) => i.id === people.X.id)!.conflicts).toEqual(["Phase13 m1"]);

    const offers = (await loadBooking(admin, x)).offers.map((o) => o.id);
    expect(offers).not.toContain(slots.fixed); // fixed pair m1 + m3
    expect(offers).toContain(slots.open); // another pair is free

    expect(await setConflict(sessions.m1, people.X.id, false)).toEqual({ ok: true });
    expect((await loadTeamApplicant(sessions.m2, people.X.id))!.conflicts).toEqual([]);
    expect((await loadBooking(admin, x)).offers.map((o) => o.id)).toContain(slots.fixed);
  });

  it("after booking, the admins see a hint in the overview", async () => {
    expect((await loadOverview(sessions.admin, new Date(), roundId))!.hints).toEqual([]);
    expect(await setConflict(sessions.m2, people.Y.id, true)).toEqual({ ok: true });

    const overview = (await loadOverview(sessions.admin, new Date(), roundId))!;
    expect(overview.hints).toEqual(["Di., 20.10., 10:00, Phase13 Y: Phase13 m2 ist bei diesem Bewerber befangen. Bitte neu besetzen."]);
    // The booking stays until an admin moves it.
    expect((await loadTeamApplicant(sessions.m2, people.Y.id))!.slot).not.toBeNull();

    expect(await setConflict(sessions.m2, people.Y.id, false)).toEqual({ ok: true });
  });
});

describe("status 'nicht erschienen'", () => {
  it("only admins set it", async () => {
    expect(await setStatus(sessions.m1, people.X.id, "no_show")).toEqual({ error: "Das dürfen nur Admins." });
    const direct = await sessions.m1.from("applicants").update({ status: "no_show" }).eq("id", people.X.id).select("id");
    expect(direct.data).toEqual([]);
    expect((await loadTeamApplicant(sessions.m1, people.X.id))!.status).toBe("active");

    expect(await setStatus(sessions.admin, people.X.id, "no_show")).toEqual({ ok: true });
    expect((await loadTeamApplicant(sessions.m1, people.X.id))!.status).toBe("no_show");
    expect(await setStatus(sessions.admin, people.X.id, "active")).toEqual({ ok: true });
  });
});

describe("admin deletes an application", () => {
  it("a member may not delete", async () => {
    expect(await deleteApplicantAsAdmin(sessions.m1, people.Y.id, send)).toEqual({ error: "Das dürfen nur Admins." });
    const direct = await sessions.m1.from("applicants").delete().eq("id", people.Y.id).select("id");
    expect(direct.data).toEqual([]);
    await sessions.m1.storage.from("cv").remove([`${roundId}/${people.Y.id}.pdf`]);
    expect(await files(people.Y.id)).toHaveLength(2);
    expect(sent).toEqual([]);
  });

  it("removes row, answers and every PDF, frees the slot and cancels it for the interviewers", async () => {
    expect(await deleteApplicantAsAdmin(sessions.admin, people.Y.id, send)).toEqual({ ok: true });

    const row = await admin.from("applicants").select("id").eq("id", people.Y.id).maybeSingle();
    expect(row.data).toBeNull();
    const answers = await admin.from("answers").select("id").eq("applicant_id", people.Y.id);
    expect(answers.data).toEqual([]);
    expect(await files(people.Y.id)).toEqual([]);

    const slot = await admin.from("slots").select("applicant_id, interviewer_a, interviewer_b").eq("id", slots.booked).single();
    expect(slot.data).toEqual({ applicant_id: null, interviewer_a: null, interviewer_b: null });

    expect(sent.map((m) => m.to).sort()).toEqual([mails.m1, mails.m2].sort());
    expect(sent.every((m) => m.ics?.method === "CANCEL")).toBe(true);

    expect(await deleteApplicantAsAdmin(sessions.admin, people.Y.id, send)).toEqual({
      error: "Diese Bewerbung gibt es nicht mehr. Bitte Seite neu laden.",
    });
    // The other application is untouched.
    expect(await files(people.X.id)).toHaveLength(1);
  });
});
