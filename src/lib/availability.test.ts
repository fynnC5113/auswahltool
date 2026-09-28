// Phase 9: availability, locations and blocked times against
// "auswahltool-test". Members save their own cells and limit; only admins
// manage locations and blocked times; a deactivated member saves nothing.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { dayCells } from "./availability-grid";
import { loadBlockedTimes, loadMyAvailability, saveAvailability } from "./availability";
import {
  addBlockedTime,
  addLocation,
  deleteBlockedTime,
  deleteLocation,
  loadLocations,
  renameLocation,
  setDefaultLocation,
} from "./locations";

const emails: string[] = [];
const email = (prefix: string) => {
  const e = testEmail(prefix);
  emails.push(e);
  return e;
};

let asAdmin: SupabaseClient;
let asMember: SupabaseClient;
let asInactive: SupabaseClient;
let memberId: string;
let adminId: string;
let inactiveId: string;
let roundId: string;

// Interview days 20.–26.10.2026, across the change to winter time on 25.10.
const oct20 = dayCells("2026-10-20");
const oct26 = dayCells("2026-10-26");

beforeAll(async () => {
  const adminEmail = email("phase9-admin");
  const memberEmail = email("phase9-member");
  const inactiveEmail = email("phase9-inactive");
  adminId = await createMember(adminEmail, "admin");
  memberId = await createMember(memberEmail, "member");
  inactiveId = await createMember(inactiveEmail, "member", false);
  [asAdmin, asMember, asInactive] = await Promise.all([signIn(adminEmail), signIn(memberEmail), signIn(inactiveEmail)]);

  const { data, error } = await admin
    .from("rounds")
    .insert({
      year: 2026,
      title: `Phase 9 ${randomUUID()}`,
      seats: 8,
      interview_minutes: 30,
      application_opens_at: "2026-10-01T00:00:00Z",
      application_closes_at: "2026-10-15T00:00:00Z",
      interviews_from: "2026-10-20",
      interviews_until: "2026-10-26",
      deletion_date: "2026-12-31",
      reply_to: "test@example.invalid",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  roundId = data.id;
});
afterAll(async () => {
  if (roundId) await admin.from("rounds").delete().eq("id", roundId);
  await deleteUsersByEmail(emails);
});

describe("saveAvailability", () => {
  it("a member saves cells and a limit, and can change both", async () => {
    const first = [oct20[0].start, oct20[1].start, oct26[0].start];
    expect(await saveAvailability(asMember, { roundId, starts: first, maxInterviews: "3" })).toEqual({ ok: true });
    expect(await loadMyAvailability(asMember, roundId, memberId)).toEqual({ starts: [...first].sort(), maxInterviews: 3 });

    const second = [oct20[1].start, oct20[2].start];
    expect(await saveAvailability(asMember, { roundId, starts: second, maxInterviews: "" })).toEqual({ ok: true });
    expect(await loadMyAvailability(asMember, roundId, memberId)).toEqual({ starts: second, maxInterviews: null });

    const { data } = await admin.from("availabilities").select("starts_at, ends_at").eq("member_id", memberId).order("starts_at");
    expect(data?.map((row) => [new Date(row.starts_at).toISOString(), new Date(row.ends_at).toISOString()])).toEqual(
      second.map((start) => [start, new Date(Date.parse(start) + 15 * 60 * 1000).toISOString()]),
    );
  });

  it("stores winter time after 25.10. (08:00 Berlin = 07:00 UTC)", async () => {
    expect(await saveAvailability(asAdmin, { roundId, starts: [oct26[0].start], maxInterviews: "" })).toEqual({ ok: true });
    const { data } = await admin.from("availabilities").select("starts_at").eq("member_id", adminId).single();
    expect(new Date(data!.starts_at).toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });

  it("an empty selection removes all cells", async () => {
    const id = await createMember(email("phase9-empty"), "member");
    const session = await signIn(emails.at(-1)!);
    await saveAvailability(session, { roundId, starts: [oct20[5].start], maxInterviews: "" });
    expect(await saveAvailability(session, { roundId, starts: [], maxInterviews: "0" })).toEqual({ ok: true });
    expect(await loadMyAvailability(session, roundId, id)).toEqual({ starts: [], maxInterviews: 0 });
  });

  it("rejects cells outside the grid and invalid limits, and saves nothing", async () => {
    const before = await loadMyAvailability(asMember, roundId, memberId);
    expect(await saveAvailability(asMember, { roundId, starts: ["2026-10-27T07:00:00.000Z"], maxInterviews: "" })).toHaveProperty(
      "error",
    );
    expect(await saveAvailability(asMember, { roundId, starts: [oct20[3].start], maxInterviews: "-1" })).toHaveProperty("error");
    expect(await loadMyAvailability(asMember, roundId, memberId)).toEqual(before);
  });

  it("a deactivated member saves nothing", async () => {
    expect(await saveAvailability(asInactive, { roundId, starts: [oct20[0].start], maxInterviews: "" })).toHaveProperty("error");
    const { count } = await admin.from("availabilities").select("id", { count: "exact", head: true }).eq("member_id", inactiveId);
    expect(count).toBe(0);
  });
});

describe("locations", () => {
  it("the first location becomes the default; names are unique per round", async () => {
    expect(await addLocation(asAdmin, roundId, " 0.23 ")).toEqual({ ok: true });
    expect(await addLocation(asAdmin, roundId, "Raum B")).toEqual({ ok: true });
    expect(await addLocation(asAdmin, roundId, "raum b")).toEqual({ error: "Diesen Ort gibt es schon." });
    const locations = await loadLocations(asAdmin, roundId);
    expect(locations.map((l) => [l.name, l.isDefault])).toEqual([
      ["0.23", true],
      ["Raum B", false],
    ]);
  });

  it("admin may rename a location and change the default", async () => {
    const roomB = (await loadLocations(asAdmin, roundId)).find((l) => l.name === "Raum B")!;
    expect(await renameLocation(asAdmin, roomB.id, "Raum C")).toEqual({ ok: true });
    expect(await setDefaultLocation(asAdmin, roomB.id)).toEqual({ ok: true });
    expect((await loadLocations(asAdmin, roundId)).map((l) => [l.name, l.isDefault])).toEqual([
      ["Raum C", true],
      ["0.23", false],
    ]);
    expect(await setDefaultLocation(asAdmin, (await loadLocations(asAdmin, roundId))[1].id)).toEqual({ ok: true });
  });

  it("a member may not add, rename, set the default or delete", async () => {
    const [location] = await loadLocations(asMember, roundId);
    expect(await addLocation(asMember, roundId, "Raum X")).toEqual({ error: "Das dürfen nur Admins." });
    expect(await renameLocation(asMember, location.id, "Umbenannt")).toEqual({ error: "Das dürfen nur Admins." });
    expect(await setDefaultLocation(asMember, location.id)).toEqual({ error: "Das dürfen nur Admins." });
    expect(await deleteLocation(asMember, location.id)).toEqual({ error: "Das dürfen nur Admins." });
    expect((await loadLocations(asAdmin, roundId)).map((l) => l.name)).toEqual(["0.23", "Raum C"]);
  });

  it("a location with slots cannot be deleted; one without can", async () => {
    const { data: withSlot } = await admin.from("locations").insert({ round_id: roundId, name: "Mit Termin" }).select("id").single();
    const slot = await admin.from("slots").insert({
      round_id: roundId,
      location_id: withSlot!.id,
      starts_at: "2026-10-21T08:00:00Z",
      interview_ends_at: "2026-10-21T08:30:00Z",
      ends_at: "2026-10-21T08:45:00Z",
      interviewer_a: adminId,
      interviewer_b: memberId,
    });
    if (slot.error) throw new Error(slot.error.message);
    expect(await deleteLocation(asAdmin, withSlot!.id)).toHaveProperty("error");

    const roomC = (await loadLocations(asAdmin, roundId)).find((l) => l.name === "Raum C")!;
    expect(await deleteLocation(asAdmin, roomC.id)).toEqual({ ok: true });
    expect((await loadLocations(asAdmin, roundId)).map((l) => l.name)).toEqual(["0.23", "Mit Termin"]);
  });
});

describe("blocked times", () => {
  it("admin adds a blocked time in Berlin time; the grid sees it", async () => {
    const [room] = await loadLocations(asAdmin, roundId);
    expect(
      await addBlockedTime(asAdmin, { locationId: room.id, startsAt: "2026-10-20T10:00", endsAt: "2026-10-20T12:00", note: " Beratung " }),
    ).toEqual({ ok: true });
    expect((await loadLocations(asAdmin, roundId))[0].blockedTimes).toMatchObject([
      { startsAt: "2026-10-20T08:00:00.000Z", endsAt: "2026-10-20T10:00:00.000Z", note: "Beratung" },
    ]);
    expect(await loadBlockedTimes(asMember, roundId)).toEqual([
      { startsAt: "2026-10-20T08:00:00.000Z", endsAt: "2026-10-20T10:00:00.000Z", location: "0.23", note: "Beratung" },
    ]);
  });

  it("rejects an end before the start and missing times", async () => {
    const [room] = await loadLocations(asAdmin, roundId);
    expect(
      await addBlockedTime(asAdmin, { locationId: room.id, startsAt: "2026-10-20T12:00", endsAt: "2026-10-20T10:00", note: "" }),
    ).toEqual({ error: "Das Ende muss nach dem Beginn liegen." });
    expect(await addBlockedTime(asAdmin, { locationId: room.id, startsAt: "", endsAt: "2026-10-20T10:00", note: "" })).toHaveProperty(
      "error",
    );
  });

  it("a member may not add or delete a blocked time", async () => {
    const [room] = await loadLocations(asAdmin, roundId);
    expect(
      await addBlockedTime(asMember, { locationId: room.id, startsAt: "2026-10-21T10:00", endsAt: "2026-10-21T11:00", note: "" }),
    ).toEqual({ error: "Das dürfen nur Admins." });
    expect(await deleteBlockedTime(asMember, room.blockedTimes[0].id)).toEqual({ error: "Das dürfen nur Admins." });
    expect((await loadLocations(asAdmin, roundId))[0].blockedTimes).toHaveLength(1);
  });

  it("admin may delete a blocked time", async () => {
    const [room] = await loadLocations(asAdmin, roundId);
    expect(await deleteBlockedTime(asAdmin, room.blockedTimes[0].id)).toEqual({ ok: true });
    expect(await loadBlockedTimes(asMember, roundId)).toEqual([]);
  });
});
