// Phase 7: applications against "auswahltool-test" (TECH_DESIGN 6.1).
// Form with the secret-key client, admin entry with an admin session.
// Sending is mocked; CVs are really uploaded with signed upload URLs.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { sendMail } from "@/lib/mail/send";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import type { ApplicationFields } from "./application-form";
import {
  findApplicant,
  prepareApplication,
  prepareCvReplacement,
  submitApplication,
  updateApplication,
  withdrawApplication,
  type Deps,
  type Source,
} from "./application";

const send = vi.fn<typeof sendMail>();
const emails: string[] = [];
let roundId: string;
let questions: string[];
let departments: string[];
let asAdmin: SupabaseClient;
let asMember: SupabaseClient;

const opensAt = new Date(Date.now() - 86_400_000);
const closesAt = new Date(Date.now() + 86_400_000);
const deps = (extra: Partial<Deps> = {}): Deps => ({ send, roundId, ...extra });

const pdf = (text = "%PDF-1.4\ntest") => new Blob([text], { type: "application/pdf" });

function fields(changes: Partial<ApplicationFields> = {}): ApplicationFields {
  return {
    name: "Test Bewerberin",
    email: `phase7-${randomUUID()}@example.invalid`,
    cohort: "2024",
    answers: { [questions[0]]: "Antwort eins", [questions[1]]: "Antwort zwei" },
    departmentIds: [departments[0]],
    departmentUnsure: false,
    ...changes,
  };
}

/** The personal token from the last mail sent. */
function lastToken(): string {
  const mail = send.mock.calls.at(-1)![0];
  const match = mail.text.match(/\/b\/([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error("no link in mail");
  return match[1];
}

async function upload(db: SupabaseClient, path: string, token: string, file: Blob) {
  return db.storage.from("cv").uploadToSignedUrl(path, token, file, { contentType: file.type });
}

/** Full form flow: prepare, upload, submit. */
async function apply(input: ApplicationFields, file: Blob = pdf(), db: SupabaseClient = admin, source: Source = "form", extra: Partial<Deps> = {}) {
  const prepared = await prepareApplication(db, input, source, deps(extra));
  if (prepared.status !== "upload") return prepared;
  const up = await upload(db, prepared.path, prepared.token, file);
  if (up.error) throw new Error(up.error.message);
  return submitApplication(db, input, prepared.applicantId, source, deps(extra));
}

async function filesOf(applicantId: string): Promise<string[]> {
  const { data } = await admin.storage.from("cv").list(roundId, { search: applicantId });
  return (data ?? []).map((f) => f.name);
}

async function rowByEmail(email: string) {
  const { data } = await admin.from("applicants").select("id, token_hash, cv_path, source").eq("round_id", roundId).eq("email", email.toLowerCase());
  return data ?? [];
}

beforeAll(async () => {
  const round = await admin
    .from("rounds")
    .insert({
      year: 2026,
      title: `Phase 7 ${randomUUID()}`,
      seats: 10,
      interview_minutes: 30,
      application_opens_at: opensAt.toISOString(),
      application_closes_at: closesAt.toISOString(),
      interviews_from: "2026-10-20",
      interviews_until: "2026-10-31",
      deletion_date: "2026-12-31",
      reply_to: "test@example.invalid",
    })
    .select("id")
    .single();
  if (round.error) throw new Error(round.error.message);
  roundId = round.data.id;
  const q = await admin
    .from("questions")
    .insert([0, 1].map((position) => ({ round_id: roundId, position, text: `Frage ${position + 1}` })))
    .select("id, position");
  const d = await admin
    .from("departments")
    .insert([0, 1].map((position) => ({ round_id: roundId, position, name: `Ressort ${position + 1}` })))
    .select("id, position");
  if (q.error || d.error) throw new Error((q.error ?? d.error)!.message);
  questions = q.data.sort((a, b) => a.position - b.position).map((r) => r.id);
  departments = d.data.sort((a, b) => a.position - b.position).map((r) => r.id);

  const adminEmail = testEmail("phase7-admin");
  const memberEmail = testEmail("phase7-member");
  emails.push(adminEmail, memberEmail);
  await createMember(adminEmail, "admin");
  await createMember(memberEmail, "member");
  [asAdmin, asMember] = await Promise.all([signIn(adminEmail), signIn(memberEmail)]);
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
  send.mockReset().mockResolvedValue("<id@test>");
  vi.stubEnv("APP_URL", "https://auswahltool.example");
});

describe("public form", () => {
  it("saves a complete application with answers, departments and CV, and mails the personal link", async () => {
    const input = fields({ email: `Phase7-${randomUUID()}@Example.invalid`, departmentIds: departments });
    expect(await apply(input)).toEqual({ status: "done", mailSent: true });

    expect(send).toHaveBeenCalledTimes(1);
    const [mail, options] = send.mock.calls[0];
    expect(mail.to).toBe(input.email.toLowerCase());
    expect(mail.subject).toContain("Bewerbung");
    expect(options).toEqual({ transport: "gmail", replyTo: "test@example.invalid" });

    const applicant = await findApplicant(admin, lastToken());
    expect(applicant).toMatchObject({ name: "Test Bewerberin", cohort: "2024", source: "form", departmentUnsure: false });
    expect(applicant!.answers).toEqual({ [questions[0]]: "Antwort eins", [questions[1]]: "Antwort zwei" });
    expect(applicant!.departmentIds.sort()).toEqual([...departments].sort());
    expect(applicant!.cvPath).toBe(`${roundId}/${applicant!.id}.pdf`);
    expect(await filesOf(applicant!.id)).toEqual([`${applicant!.id}.pdf`]);

    // Only the hash is stored, never the token.
    const [row] = await rowByEmail(input.email);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).not.toContain(lastToken());
  });

  it("a second application with the same address creates nothing, mails a new link, and the old link stops working", async () => {
    const input = fields();
    await apply(input);
    const oldToken = lastToken();

    expect(await prepareApplication(admin, { ...input, email: input.email.toUpperCase(), name: "Andere" }, "form", deps())).toEqual({
      status: "exists",
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].subject).toBe("Dein neuer Link zu deiner Bewerbung");
    const newToken = lastToken();

    expect(newToken).not.toBe(oldToken);
    expect(await findApplicant(admin, oldToken)).toBeNull();
    expect((await findApplicant(admin, newToken))?.name).toBe("Test Bewerberin");
    expect(await rowByEmail(input.email)).toHaveLength(1);
  });

  it("rejects empty required fields before any upload", async () => {
    const result = await prepareApplication(admin, fields({ name: " ", answers: {}, departmentIds: [] }), "form", deps());
    expect(result.status).toBe("invalid");
    expect(Object.keys((result as { errors: object }).errors).sort()).toEqual(
      [`answers.${questions[0]}`, `answers.${questions[1]}`, "departments", "name"].sort(),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a file that is not a PDF even if labelled as one, and removes it", async () => {
    const input = fields();
    const prepared = await prepareApplication(admin, input, "form", deps());
    if (prepared.status !== "upload") throw new Error(prepared.status);
    await upload(admin, prepared.path, prepared.token, new Blob(["PK\u0003\u0004 docx"], { type: "application/pdf" }));

    const result = await submitApplication(admin, input, prepared.applicantId, "form", deps());
    expect(result).toEqual({ status: "invalid", errors: { cv: "Der Lebenslauf muss eine PDF-Datei sein." } });
    expect(await filesOf(prepared.applicantId)).toEqual([]);
    expect(await rowByEmail(input.email)).toHaveLength(0);
  });

  it("the bucket refuses a non-PDF type and a PDF over 10 MB on the signed upload URL", async () => {
    const prepared = await prepareApplication(admin, fields(), "form", deps());
    if (prepared.status !== "upload") throw new Error(prepared.status);
    const word = await upload(admin, prepared.path, prepared.token, new Blob(["x"], { type: "application/msword" }));
    expect(word.error).not.toBeNull();
    const big = await upload(admin, prepared.path, prepared.token, new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "application/pdf" }));
    expect(big.error).not.toBeNull();
    expect(await filesOf(prepared.applicantId)).toEqual([]);
  });

  it("refuses to submit without an uploaded CV", async () => {
    const input = fields();
    const prepared = await prepareApplication(admin, input, "form", deps());
    if (prepared.status !== "upload") throw new Error(prepared.status);
    const result = await submitApplication(admin, input, prepared.applicantId, "form", deps());
    expect(result).toMatchObject({ status: "invalid", errors: { cv: expect.stringContaining("nicht angekommen") } });
  });

  it("is closed before and after the application phase", async () => {
    expect(await prepareApplication(admin, fields(), "form", deps({ now: new Date(opensAt.getTime() - 1) }))).toEqual({ status: "closed" });
    expect(await prepareApplication(admin, fields(), "form", deps({ now: closesAt }))).toEqual({ status: "closed" });
  });

  it("saves the application but reports a failed mail", async () => {
    send.mockRejectedValueOnce(new Error("smtp down"));
    const input = fields();
    expect(await apply(input)).toEqual({ status: "done", mailSent: false });
    expect(await rowByEmail(input.email)).toHaveLength(1);
  });

  it("never touches an existing applicant's file when an id is reused", async () => {
    const input = fields();
    await apply(input);
    const [row] = await rowByEmail(input.email);
    const result = await submitApplication(admin, fields(), row.id, "form", deps());
    expect(result.status).toBe("invalid");
    expect(await filesOf(row.id)).toEqual([`${row.id}.pdf`]);
  });
});

describe("applicant page", () => {
  it("edits answers, departments and CV until the deadline; the old CV is deleted", async () => {
    await apply(fields());
    const token = lastToken();
    const before = (await findApplicant(admin, token))!;

    const replacement = await prepareCvReplacement(admin, token);
    if (replacement.status !== "upload") throw new Error(replacement.status);
    await upload(admin, replacement.path, replacement.token, pdf("%PDF-1.7\nneu"));

    const edited = fields({
      name: "Neuer Name",
      answers: { [questions[0]]: "Geändert", [questions[1]]: "Auch geändert" },
      departmentIds: [],
      departmentUnsure: true,
    });
    expect(await updateApplication(admin, token, edited, replacement.path)).toEqual({ status: "done" });

    const after = (await findApplicant(admin, token))!;
    expect(after).toMatchObject({ name: "Neuer Name", email: before.email, departmentUnsure: true, departmentIds: [], cvPath: replacement.path });
    expect(after.answers[questions[0]]).toBe("Geändert");
    expect(await filesOf(before.id)).toEqual([replacement.path.split("/")[1]]);
  });

  it("refuses edits after the deadline", async () => {
    await apply(fields());
    const token = lastToken();
    expect(await updateApplication(admin, token, fields({ name: "Zu spät" }), null, closesAt)).toEqual({ status: "closed" });
    expect(await prepareCvReplacement(admin, token, closesAt)).toEqual({ status: "closed" });
    expect((await findApplicant(admin, token))!.name).toBe("Test Bewerberin");
  });

  it("refuses a CV path of another applicant", async () => {
    await apply(fields());
    const token = lastToken();
    const result = await updateApplication(admin, token, fields(), `${roundId}/${randomUUID()}.pdf`);
    expect(result.status).toBe("invalid");
  });

  it("an unknown or malformed token finds nothing", async () => {
    expect(await findApplicant(admin, "x".repeat(43))).toBeNull();
    expect(await findApplicant(admin, "../etc")).toBeNull();
    expect(await withdrawApplication(admin, "x".repeat(43))).toBe(false);
  });

  it("withdrawal deletes the applicant, the answers and every file at once", async () => {
    await apply(fields());
    const token = lastToken();
    const applicant = (await findApplicant(admin, token))!;
    // A leftover replacement upload must go too.
    const replacement = await prepareCvReplacement(admin, token);
    if (replacement.status !== "upload") throw new Error(replacement.status);
    await upload(admin, replacement.path, replacement.token, pdf());
    expect(await filesOf(applicant.id)).toHaveLength(2);

    expect(await withdrawApplication(admin, token)).toBe(true);
    expect(await findApplicant(admin, token)).toBeNull();
    expect((await admin.from("applicants").select("id").eq("id", applicant.id)).data).toEqual([]);
    expect((await admin.from("answers").select("id").eq("applicant_id", applicant.id)).data).toEqual([]);
    expect(await filesOf(applicant.id)).toEqual([]);
  });
});

describe("admin entry", () => {
  it("an admin enters an application after the deadline, without department; the mail offers no editing", async () => {
    const input = fields({ departmentIds: [] });
    const result = await apply(input, pdf(), asAdmin, "admin", { now: new Date(closesAt.getTime() + 1000) });
    expect(result).toEqual({ status: "done", mailSent: true });
    const [row] = await rowByEmail(input.email);
    expect(row.source).toBe("admin");
    expect(send.mock.calls[0][0].text).toContain("ansehen oder zurückziehen");
  });

  it("the admin entry still requires answers", async () => {
    const result = await prepareApplication(asAdmin, fields({ answers: {} }), "admin", deps());
    expect(result.status).toBe("invalid");
  });

  it("the admin entry reports a duplicate address instead of mailing", async () => {
    const input = fields();
    await apply(input);
    send.mockClear();
    expect(await prepareApplication(asAdmin, input, "admin", deps())).toEqual({
      status: "invalid",
      errors: { email: "Für diese Adresse gibt es in dieser Runde schon eine Bewerbung." },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("a member cannot enter an application", async () => {
    await expect(prepareApplication(asMember, fields(), "admin", deps())).rejects.toThrow();
  });
});
