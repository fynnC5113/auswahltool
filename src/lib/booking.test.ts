// Phase 12: booking, rebooking and calendar mails against "auswahltool-test".
// Mails are collected, never sent.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { createToken, hashToken } from "./applicant-token";
import { findApplicant, withdrawApplication } from "./application";
import { dayCells } from "./availability-grid";
import { bookSlot, inviteToBook, loadBooking } from "./booking";
import { slotUid } from "./calendar";
import type { Mail } from "./mail/send";

const emails: string[] = [];
let sent: Mail[] = [];
const send = async (mail: Mail) => {
  sent.push(mail);
  return "test";
};
const failing = async () => {
  throw new Error("smtp down");
};

let asAdmin: SupabaseClient;
let memberIds: string[];
let roundId: string;
let rooms: string[];
/** name → slot id */
const slots: Record<string, string> = {};
/** P1…P5 → id and token */
const people: Record<string, { id: string; token: string; email: string }> = {};

const iso = (berlin: string) => new Date(berlin).toISOString();
const cellsOf = (day: string) => dayCells(day).filter((c) => c.label >= "10:00" && c.label < "12:00");

async function slotRow(id: string) {
  const { data, error } = await admin
    .from("slots")
    .select("applicant_id, interviewer_a, interviewer_b, ics_sequence, booked_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

const method = (mail: Mail) => mail.ics?.method;
const to = (who: string) => sent.filter((m) => m.to === who);

beforeAll(async () => {
  const adminEmail = testEmail("phase12-admin");
  emails.push(adminEmail);
  const ids = [await createMember(adminEmail, "admin")];
  for (const name of ["b", "c", "d"]) {
    const e = testEmail(`phase12-${name}`);
    emails.push(e);
    ids.push(await createMember(e, "member"));
  }
  memberIds = ids;
  asAdmin = await signIn(adminEmail);

  const round = await admin
    .from("rounds")
    .insert({
      year: 2026,
      title: `Phase 12 ${randomUUID()}`,
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

  const cells = memberIds.flatMap((member_id) =>
    [...cellsOf("2026-10-20"), ...cellsOf("2026-10-21")].map((c) => ({ round_id: roundId, member_id, starts_at: c.start, ends_at: c.end })),
  );
  const inserted = await admin.from("availabilities").insert(cells);
  if (inserted.error) throw new Error(inserted.error.message);

  const locations = await admin
    .from("locations")
    .insert([
      { round_id: roundId, name: "0.23", is_default: true },
      { round_id: roundId, name: "0.25", is_default: false },
    ])
    .select("id, name");
  if (locations.error) throw new Error(locations.error.message);
  rooms = ["0.23", "0.25"].map((n) => locations.data.find((l) => l.name === n)!.id);

  const slot = (room: number, start: string) => {
    const s = Date.parse(iso(start));
    return {
      round_id: roundId,
      location_id: rooms[room],
      starts_at: new Date(s).toISOString(),
      interview_ends_at: new Date(s + 30 * 60_000).toISOString(),
      ends_at: new Date(s + 45 * 60_000).toISOString(),
      status: "confirmed",
    };
  };
  const created = await admin
    .from("slots")
    .insert([
      slot(0, "2026-10-20T10:00:00+02:00"),
      slot(0, "2026-10-20T10:45:00+02:00"),
      slot(1, "2026-10-20T10:00:00+02:00"),
      slot(0, "2026-10-21T10:00:00+02:00"),
    ])
    .select("id, location_id, starts_at");
  if (created.error) throw new Error(created.error.message);
  const find = (room: number, start: string) =>
    created.data.find((s) => s.location_id === rooms[room] && Date.parse(s.starts_at) === Date.parse(iso(start)))!.id;
  slots.s1 = find(0, "2026-10-20T10:00:00+02:00");
  slots.s2 = find(0, "2026-10-20T10:45:00+02:00");
  slots.s3 = find(1, "2026-10-20T10:00:00+02:00");
  slots.s4 = find(0, "2026-10-21T10:00:00+02:00");

  for (const name of ["P1", "P2", "P3", "P4", "P5"]) {
    const token = createToken();
    const email = `${name.toLowerCase()}-${randomUUID()}@example.invalid`;
    const { data, error } = await admin
      .from("applicants")
      .insert({ round_id: roundId, name: `Bewerber ${name}`, email, cohort: "2025", token_hash: hashToken(token) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    people[name] = { id: data.id, token, email };
  }
});

afterAll(async () => {
  if (roundId) await admin.from("rounds").delete().eq("id", roundId);
  await deleteUsersByEmail(emails);
});

beforeEach(() => {
  sent = [];
});

async function applicant(name: string) {
  return (await findApplicant(admin, people[name].token))!;
}

describe("booking", () => {
  it("offers every free slot, by start", async () => {
    const state = await loadBooking(admin, await applicant("P1"));
    expect(state.booked).toBeNull();
    expect(state.planned).toBe(true);
    expect(state.offers.map((o) => o.id)).toHaveLength(4);
    expect(state.offers.map((o) => o.startsAt)).toEqual([...state.offers.map((o) => o.startsAt)].sort());
    expect(state.offers.find((o) => o.id === slots.s1)!.location).toBe("Raum 0.23");
  });

  it("booking chooses a pair and invites applicant and both interviewers", async () => {
    expect(await bookSlot(admin, people.P1.token, slots.s1, { send })).toEqual({ status: "booked", mailFailed: false });
    const row = await slotRow(slots.s1);
    expect(row.applicant_id).toBe(people.P1.id);
    expect(memberIds).toContain(row.interviewer_a);
    expect(memberIds).toContain(row.interviewer_b);
    expect(row.ics_sequence).toBe(1);
    expect(row.booked_at).not.toBeNull();

    expect(sent).toHaveLength(3);
    expect(sent.every((m) => method(m) === "REQUEST")).toBe(true);
    const own = to(people.P1.email)[0];
    expect(own.subject).toBe("Dein Gesprächstermin ist gebucht");
    expect(own.text).toContain(`/b/${people.P1.token}`);
    for (const mail of sent) {
      expect(mail.ics!.content).toContain(`UID:${slotUid(slots.s1)}`);
      expect(mail.ics!.content).toContain("SEQUENCE:1");
      // Only the recipient is an attendee.
      expect(mail.ics!.content.replace(/\r\n /g, "")).toContain(`mailto:${mail.to}\r\n`);
      expect(mail.ics!.content.match(/ATTENDEE/g)).toHaveLength(1);
    }

    const state = await loadBooking(admin, await applicant("P1"));
    expect(state.booked?.id).toBe(slots.s1);
    expect(state.canRebook).toBe(true);
    expect(state.offers.map((o) => o.id)).not.toContain(slots.s1);
  });

  it("a slot is only offered if a pair without conflicted members is free", async () => {
    // At 10:00 on 20.10. two members sit in s1; conflicts with the other two leave no pair for P2 in s3.
    const row = await slotRow(slots.s1);
    const others = memberIds.filter((id) => id !== row.interviewer_a && id !== row.interviewer_b);
    const inserted = await admin.from("conflicts").insert(others.map((member_id) => ({ applicant_id: people.P2.id, member_id })));
    expect(inserted.error).toBeNull();

    const state = await loadBooking(admin, await applicant("P2"));
    expect(state.offers.map((o) => o.id)).not.toContain(slots.s3);
    expect(state.offers.map((o) => o.id)).toContain(slots.s4);
    expect(await bookSlot(admin, people.P2.token, slots.s3, { send })).toEqual({ status: "taken" });
    expect(sent).toHaveLength(0);
    // Another applicant still gets s3.
    expect((await loadBooking(admin, await applicant("P3"))).offers.map((o) => o.id)).toContain(slots.s3);
    await admin.from("conflicts").delete().eq("applicant_id", people.P2.id);
  });

  it("rebooking frees the old slot, cancels it and invites to the new one", async () => {
    const old = await slotRow(slots.s1);
    expect(await bookSlot(admin, people.P1.token, slots.s4, { send })).toEqual({ status: "booked", mailFailed: false });

    const freed = await slotRow(slots.s1);
    expect(freed).toMatchObject({ applicant_id: null, interviewer_a: null, interviewer_b: null, ics_sequence: 2, booked_at: null });
    const booked = await slotRow(slots.s4);
    expect(booked.applicant_id).toBe(people.P1.id);

    const mine = to(people.P1.email);
    expect(mine.map(method)).toEqual(["CANCEL", "REQUEST"]);
    expect(mine[0].ics!.content).toContain(`UID:${slotUid(slots.s1)}`);
    expect(mine[0].ics!.content).toContain("SEQUENCE:2");
    expect(mine[0].ics!.content).toContain("STATUS:CANCELLED");
    expect(mine[1].subject).toBe("Dein neuer Gesprächstermin");
    expect(mine[1].ics!.content).toContain(`UID:${slotUid(slots.s4)}`);

    const oldPair = [old.interviewer_a, old.interviewer_b];
    const { data: team } = await admin.from("team_members").select("id, email").in("id", memberIds);
    const emailOf = (id: string) => team!.find((m) => m.id === id)!.email;
    for (const id of oldPair) {
      expect(to(emailOf(id!)).some((m) => method(m) === "CANCEL" && m.ics!.content.includes(slotUid(slots.s1)))).toBe(true);
    }
    for (const id of [booked.interviewer_a, booked.interviewer_b]) {
      expect(to(emailOf(id!)).some((m) => method(m) === "REQUEST" && m.ics!.content.includes(slotUid(slots.s4)))).toBe(true);
    }
    expect(sent).toHaveLength(6);
  });

  it("two applicants booking the same slot at the same time: exactly one succeeds", async () => {
    const results = await Promise.all([
      bookSlot(admin, people.P3.token, slots.s2, { send }),
      bookSlot(admin, people.P4.token, slots.s2, { send }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["booked", "taken"]);
    const row = await slotRow(slots.s2);
    expect([people.P3.id, people.P4.id]).toContain(row.applicant_id);
  });

  it("no booking or rebooking after the deadline", async () => {
    // 30 days before the slots: the deadline of every slot is already over.
    await admin.from("rounds").update({ rebook_hours_before: 24 * 30 }).eq("id", roundId);
    try {
      const state = await loadBooking(admin, await applicant("P1"));
      expect(state.canRebook).toBe(false);
      expect(state.offers).toEqual([]);
      expect(await bookSlot(admin, people.P1.token, slots.s3, { send })).toEqual({
        status: "error",
        message: "Die Frist zum Umbuchen ist abgelaufen. Dein bisheriger Termin bleibt.",
      });
      expect(await bookSlot(admin, people.P5.token, slots.s3, { send })).toEqual({
        status: "error",
        message: "Dieser Termin ist zu kurzfristig. Bitte wähle einen späteren.",
      });
      expect((await slotRow(slots.s4)).applicant_id).toBe(people.P1.id);
      expect(sent).toHaveLength(0);
    } finally {
      await admin.from("rounds").update({ rebook_hours_before: 24 }).eq("id", roundId);
    }
  });

  it("the database refuses a pair over its limit", async () => {
    const booked = await slotRow(slots.s4);
    const member = booked.interviewer_a!;
    await admin.from("member_round_settings").upsert({ round_id: roundId, member_id: member, max_interviews: 1 });
    try {
      const partner = memberIds.find((id) => id !== member && id !== booked.interviewer_b)!;
      const { error } = await admin.rpc("book_slot", {
        p_slot_id: slots.s3,
        p_applicant_id: people.P5.id,
        p_interviewer_a: member,
        p_interviewer_b: partner,
      });
      expect(error?.hint).toBe("over_limit");
      expect(error?.details).toBe(member);
    } finally {
      await admin.from("member_round_settings").delete().eq("round_id", roundId).eq("member_id", member);
    }
  });

  it("booking with the publishable key is not possible", async () => {
    const { error } = await asAdmin.rpc("book_slot", {
      p_slot_id: slots.s3,
      p_applicant_id: people.P5.id,
      p_interviewer_a: memberIds[0],
      p_interviewer_b: memberIds[1],
    });
    expect(error?.code).toBe("42501");
  });

  it("a withdrawal frees the slot and cancels it for the interviewers only", async () => {
    const booked = await slotRow(slots.s4);
    expect(await withdrawApplication(admin, people.P1.token, { send })).toBe(true);
    expect(await slotRow(slots.s4)).toMatchObject({ applicant_id: null, interviewer_a: null, ics_sequence: booked.ics_sequence + 1 });
    expect(sent).toHaveLength(2);
    expect(sent.every((m) => method(m) === "CANCEL" && m.ics!.content.includes(`SEQUENCE:${booked.ics_sequence + 1}`))).toBe(true);
    expect(to(people.P1.email)).toHaveLength(0);
  });
});

describe("asking applicants without a slot to book", () => {
  it("sends a new link to everyone without a slot; the old link stops working", async () => {
    const result = await inviteToBook(asAdmin, roundId, send);
    // P2, P5 and whichever of P3/P4 did not get s2.
    expect(result).toEqual({ ok: true, sent: 3, failed: 0 });
    const mail = to(people.P5.email)[0];
    expect(mail.subject).toBe("Dein Gesprächstermin beim Orga-Team der Law Clinic");
    const token = mail.text.match(/\/b\/([A-Za-z0-9_-]{43})/)![1];
    expect(await findApplicant(admin, people.P5.token)).toBeNull();
    expect((await findApplicant(admin, token))?.id).toBe(people.P5.id);
    people.P5.token = token;
  });

  it("if the mail fails, the old link keeps working", async () => {
    expect(await inviteToBook(asAdmin, roundId, failing)).toEqual({ ok: true, sent: 0, failed: 3 });
    expect((await findApplicant(admin, people.P5.token))?.id).toBe(people.P5.id);
  });
});
