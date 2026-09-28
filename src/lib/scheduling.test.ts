// Phase 11: scheduling against "auswahltool-test". Every possible slot is
// offered without a pair; entering an applicant chooses the pair. Capacity,
// overlap rules, fixing a pair and "preferred" (admins only).
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { dayCells } from "./availability-grid";
import { addLocation } from "./locations";
import {
  assignApplicant,
  deleteFreeSlots,
  deleteSlot,
  generateSlots,
  hintContext,
  loadScheduling,
  saveSlot,
  setPair,
  setPreferred,
  unassignApplicant,
} from "./scheduling";
import { capacity, slotHints } from "./scheduling-rules";

const emails: string[] = [];
/** Entering, removing and changing a pair send calendar mails from Phase 12; never here. */
const noMail = async () => "not sent";
const email = (prefix: string) => {
  const e = testEmail(prefix);
  emails.push(e);
  return e;
};

let asAdmin: SupabaseClient;
let asMember: SupabaseClient;
let adminId: string;
let memberId: string;
let member2Id: string;
/** Active, but without availability. */
let member3Id: string;
let inactiveId: string;
let roundId: string;
let applicantIds: string[];

// 20.10.2026 10:00–12:00: three active members and the deactivated one.
// 21.10.2026 14:00–16:00: admin and member only.
const morning = dayCells("2026-10-20").filter((c) => c.label >= "10:00" && c.label < "12:00");
const afternoon = dayCells("2026-10-21").filter((c) => c.label >= "14:00" && c.label < "16:00");
const iso = (berlin: string) => new Date(berlin).toISOString();

beforeAll(async () => {
  const adminEmail = email("phase11-admin");
  const memberEmail = email("phase11-member");
  adminId = await createMember(adminEmail, "admin");
  memberId = await createMember(memberEmail, "member");
  member2Id = await createMember(email("phase11-member2"), "member");
  member3Id = await createMember(email("phase11-member3"), "member");
  inactiveId = await createMember(email("phase11-inactive"), "member", false);
  [asAdmin, asMember] = await Promise.all([signIn(adminEmail), signIn(memberEmail)]);

  const { data, error } = await admin
    .from("rounds")
    .insert({
      year: 2026,
      title: `Phase 11 ${randomUUID()}`,
      seats: 8,
      interview_minutes: 30,
      buffer_minutes: 15,
      application_opens_at: "2026-10-01T00:00:00Z",
      application_closes_at: "2026-10-15T00:00:00Z",
      interviews_from: "2026-10-20",
      interviews_until: "2026-10-21",
      deletion_date: "2026-12-31",
      reply_to: "test@example.invalid",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  roundId = data.id;

  const row = (member_id: string) => (c: { start: string; end: string }) => ({
    round_id: roundId,
    member_id,
    starts_at: c.start,
    ends_at: c.end,
  });
  const cells = [
    ...[adminId, memberId, member2Id, inactiveId].flatMap((id) => morning.map(row(id))),
    ...[adminId, memberId].flatMap((id) => afternoon.map(row(id))),
  ];
  const inserted = await admin.from("availabilities").insert(cells);
  if (inserted.error) throw new Error(inserted.error.message);

  const applicants = await admin
    .from("applicants")
    .insert(
      Array.from({ length: 5 }, (_, i) => ({
        round_id: roundId,
        name: `Bewerber ${i + 1}`,
        email: `${randomUUID()}@example.invalid`,
        cohort: "2025",
        token_hash: randomUUID(),
      })),
    )
    .select("id");
  if (applicants.error) throw new Error(applicants.error.message);
  applicantIds = applicants.data.map((a) => a.id);

  expect(await addLocation(asAdmin, roundId, "0.23")).toEqual({ ok: true });
  expect(await addLocation(asAdmin, roundId, "Raum B")).toEqual({ ok: true });
});
afterAll(async () => {
  if (roundId) await admin.from("rounds").delete().eq("id", roundId);
  await deleteUsersByEmail(emails);
});

const load = () => loadScheduling(asAdmin, roundId);
const slotAt = async (berlin: string) => (await load()).slots.find((s) => s.startsAt === iso(berlin))!;

describe("generating slots", () => {
  it("a member may not generate slots", async () => {
    expect(await generateSlots(asMember, roundId)).toEqual({ error: "Das dürfen nur Admins." });
  });

  it("every possible slot, without a pair, bookable at once", async () => {
    expect(await generateSlots(asAdmin, roundId)).toEqual({ ok: true, created: 6 });
    const data = await load();
    // Three people are not enough for a second location at the same time.
    const rooms = new Map(data.locations.map((l) => [l.id, l.name]));
    expect(data.slots.map((s) => `${rooms.get(s.locationId)} ${s.startsAt}`)).toEqual([
      `0.23 ${iso("2026-10-20T10:00:00+02:00")}`,
      `0.23 ${iso("2026-10-20T10:45:00+02:00")}`,
      `0.23 ${iso("2026-10-20T11:30:00+02:00")}`,
      `0.23 ${iso("2026-10-21T14:00:00+02:00")}`,
      `0.23 ${iso("2026-10-21T14:45:00+02:00")}`,
      `0.23 ${iso("2026-10-21T15:30:00+02:00")}`,
    ]);
    expect(data.slots.every((s) => s.interviewerA === null && s.status === "confirmed")).toBe(true);
    expect(capacity(data.applicants.length, hintContext(data))).toEqual({
      applications: 5,
      booked: 0,
      withoutSlot: 5,
      free: 6,
      bookable: 6,
    });
  });

  it("clicking again adds nothing new", async () => {
    expect(await generateSlots(asAdmin, roundId)).toEqual({ ok: true, created: 0 });
  });
});

describe("entering applicants", () => {
  it("3 applicants get a slot and a pair; capacity counts down", async () => {
    // The applicant of the second slot has a conflict with member2.
    const conflict = await admin.from("conflicts").insert({ applicant_id: applicantIds[1], member_id: member2Id });
    if (conflict.error) throw new Error(conflict.error.message);

    const first = await slotAt("2026-10-20T10:00:00+02:00");
    const second = await slotAt("2026-10-20T10:45:00+02:00");
    const third = await slotAt("2026-10-21T14:00:00+02:00");
    expect(await assignApplicant(asAdmin, first.id, applicantIds[0], noMail)).toEqual({ ok: true });
    expect(await assignApplicant(asAdmin, second.id, applicantIds[1], noMail)).toEqual({ ok: true });
    expect(await assignApplicant(asAdmin, third.id, applicantIds[2], noMail)).toEqual({ ok: true });

    const data = await load();
    const pairOf = (id: string) => {
      const s = data.slots.find((x) => x.id === id)!;
      return [s.interviewerA!, s.interviewerB!].sort();
    };
    const active = [adminId, memberId, member2Id];
    expect(pairOf(first.id).every((id) => active.includes(id))).toBe(true);
    expect(pairOf(second.id)).not.toContain(member2Id);
    expect(pairOf(third.id)).toEqual([adminId, memberId].sort());
    expect(capacity(5, hintContext(data))).toMatchObject({ booked: 3, withoutSlot: 2, free: 3 });
  });

  it("an applicant cannot get a second slot; a booked slot cannot be deleted", async () => {
    const free = await slotAt("2026-10-20T11:30:00+02:00");
    const booked = await slotAt("2026-10-20T10:00:00+02:00");
    expect(await assignApplicant(asAdmin, free.id, applicantIds[0], noMail)).toEqual({ error: "Dieser Bewerber hat schon einen Termin." });
    expect(await assignApplicant(asAdmin, booked.id, applicantIds[3], noMail)).toHaveProperty("error");
    expect(await deleteSlot(asAdmin, booked.id)).toHaveProperty("error");
  });

  it("no pair left: the admin gets a clear message", async () => {
    // 21.10. afternoon has only admin and member; this applicant is conflicted with admin.
    const conflict = await admin.from("conflicts").insert({ applicant_id: applicantIds[3], member_id: adminId });
    if (conflict.error) throw new Error(conflict.error.message);
    const slot = await slotAt("2026-10-21T14:45:00+02:00");
    expect(await assignApplicant(asAdmin, slot.id, applicantIds[3], noMail)).toEqual({
      error: "Zu dieser Zeit ist kein passendes Paar frei. Bitte das Paar von Hand festlegen.",
    });
  });

  it("a member may not enter applicants or fix pairs", async () => {
    const slot = await slotAt("2026-10-20T11:30:00+02:00");
    expect(await assignApplicant(asMember, slot.id, applicantIds[4], noMail)).toEqual({ error: "Das dürfen nur Admins." });
    expect(await setPair(asMember, slot.id, adminId, memberId, noMail)).toEqual({ error: "Das dürfen nur Admins." });
  });
});

describe("changing slots", () => {
  it("a slot overlapping another at the same location is rejected", async () => {
    const first = await slotAt("2026-10-20T10:00:00+02:00");
    const clash = await saveSlot(asAdmin, {
      roundId,
      locationId: first.locationId,
      startsAt: "2026-10-20T10:15",
      interviewerA: "",
      interviewerB: "",
    });
    expect(clash).toEqual({ error: "Am Ort gibt es zu dieser Zeit schon einen Termin (Puffer eingeschlossen)." });
  });

  it("a pair putting a person into two conversations at once is rejected, at another location too", async () => {
    const data = await load();
    const first = await slotAt("2026-10-20T10:00:00+02:00");
    const roomB = data.locations.find((l) => l.name === "Raum B")!;
    const result = await saveSlot(asAdmin, {
      roundId,
      locationId: roomB.id,
      startsAt: "2026-10-20T10:15",
      interviewerA: first.interviewerA!,
      interviewerB: member3Id,
    });
    expect("error" in result && result.error).toMatch(/sitzt zu dieser Zeit schon in einem anderen Gespräch/);
    // Without a pair the same slot is fine: the location is free.
    expect(
      await saveSlot(asAdmin, { roundId, locationId: roomB.id, startsAt: "2026-10-20T10:15", interviewerA: "", interviewerB: "" }),
    ).toEqual({ ok: true });
    expect(await deleteSlot(asAdmin, (await slotAt("2026-10-20T10:15:00+02:00")).id)).toEqual({ ok: true });
  });

  it("a slot by hand: ends follow from interview and buffer; incomplete or doubled pairs are rejected", async () => {
    const [room] = (await load()).locations;
    const at17 = { roundId, locationId: room.id, startsAt: "2026-10-21T17:00" };
    expect(await saveSlot(asAdmin, { ...at17, interviewerA: memberId, interviewerB: "" })).toEqual({
      error: "Bitte beide Gesprächsführer wählen oder beide leer lassen.",
    });
    expect(await saveSlot(asAdmin, { ...at17, interviewerA: memberId, interviewerB: memberId })).toEqual({
      error: "Bitte zwei verschiedene Gesprächsführer wählen.",
    });
    expect(await saveSlot(asAdmin, { ...at17, interviewerA: "", interviewerB: "" })).toEqual({ ok: true });
    const created = await slotAt("2026-10-21T17:00:00+02:00");
    expect(created).toMatchObject({
      interviewEndsAt: iso("2026-10-21T17:30:00+02:00"),
      endsAt: iso("2026-10-21T17:45:00+02:00"),
      interviewerA: null,
    });
    // Nobody is available then.
    expect(slotHints(created, hintContext(await load()))).toEqual([{ kind: "no_pair" }]);
    expect(await deleteSlot(asAdmin, created.id)).toEqual({ ok: true });
  });

  it("the pair of a booked slot can be changed but not removed; hints show", async () => {
    const booked = await slotAt("2026-10-21T14:00:00+02:00");
    expect(await setPair(asAdmin, booked.id, "", "", noMail)).toEqual({ error: "Ein gebuchter Termin braucht zwei Gesprächsführer." });
    expect(await setPair(asAdmin, booked.id, memberId, member3Id, noMail)).toEqual({ ok: true });
    const changed = await slotAt("2026-10-21T14:00:00+02:00");
    expect(slotHints(changed, hintContext(await load()))).toEqual([{ kind: "unavailable", memberId: member3Id }]);
  });

  it("removing the applicant frees the slot and its pair", async () => {
    const booked = await slotAt("2026-10-21T14:00:00+02:00");
    expect(await unassignApplicant(asAdmin, booked.id, noMail)).toEqual({ ok: true });
    expect(await slotAt("2026-10-21T14:00:00+02:00")).toMatchObject({ applicantId: null, interviewerA: null, interviewerB: null });
  });

  it("deleting free slots keeps booked ones; generating again refills", async () => {
    expect(await deleteFreeSlots(asMember, roundId)).toEqual({ error: "Das dürfen nur Admins." });
    expect(await deleteFreeSlots(asAdmin, roundId)).toEqual({ ok: true });
    const left = await load();
    expect(left.slots.map((s) => s.startsAt)).toEqual([iso("2026-10-20T10:00:00+02:00"), iso("2026-10-20T10:45:00+02:00")]);

    // 11:30 (people are free after the 10:45 slot's buffer) and the afternoon again.
    expect(await generateSlots(asAdmin, roundId)).toEqual({ ok: true, created: 4 });
  });
});

describe("preferred", () => {
  it("only an admin sets it; the member's own limit keeps working", async () => {
    expect(await setPreferred(asMember, roundId, memberId, true)).toEqual({ error: "Das dürfen nur Admins." });
    const direct = await asMember
      .from("member_round_settings")
      .upsert({ round_id: roundId, member_id: memberId, preferred: true }, { onConflict: "round_id,member_id" });
    expect(direct.error?.code).toBe("42501");

    expect(await setPreferred(asAdmin, roundId, memberId, true)).toEqual({ ok: true });
    const own = await asMember
      .from("member_round_settings")
      .upsert({ round_id: roundId, member_id: memberId, max_interviews: 4 }, { onConflict: "round_id,member_id" });
    expect(own.error).toBeNull();

    expect((await load()).members.find((m) => m.id === memberId)).toMatchObject({ preferred: true, maxInterviews: 4 });
    expect(await setPreferred(asAdmin, roundId, memberId, false)).toEqual({ ok: true });
    expect((await load()).members.find((m) => m.id === memberId)?.preferred).toBe(false);
  });
});
