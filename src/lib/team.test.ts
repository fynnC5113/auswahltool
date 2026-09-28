// Phase 5: team administration against "auswahltool-test". Admins may add,
// deactivate and promote; members and deactivated admins may not; an admin
// cannot deactivate or demote themselves.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createMember, deleteUsersByEmail, signIn, testEmail } from "@/test/supabase";
import { getMember } from "@/lib/auth/member";
import { addMember, setActive, setRole } from "./team";

const emails: string[] = [];
const email = (prefix: string) => {
  const e = testEmail(prefix);
  emails.push(e);
  return e;
};

let asAdmin: SupabaseClient;
let asMember: SupabaseClient;
let asInactiveAdmin: SupabaseClient;
let adminId: string;
let memberId: string;

beforeAll(async () => {
  const adminEmail = email("phase5-admin");
  const memberEmail = email("phase5-member");
  const inactiveEmail = email("phase5-inactive-admin");
  adminId = await createMember(adminEmail, "admin");
  memberId = await createMember(memberEmail, "member");
  await createMember(inactiveEmail, "admin", false);
  [asAdmin, asMember, asInactiveAdmin] = await Promise.all([signIn(adminEmail), signIn(memberEmail), signIn(inactiveEmail)]);
});
afterAll(() => deleteUsersByEmail(emails));

async function row(address: string) {
  const { data } = await admin.from("team_members").select("id, name, role, active").eq("email", address).maybeSingle();
  return data;
}

describe("addMember", () => {
  it("admin may add a member; the address is stored in lower case", async () => {
    const address = email("phase5-new");
    expect(await addMember(asAdmin, admin, { name: " Neu ", email: address.toUpperCase(), role: "member" })).toEqual({ ok: true });
    expect(await row(address)).toMatchObject({ name: "Neu", role: "member", active: true });
  });

  it("the same address cannot be added twice", async () => {
    const address = email("phase5-twice");
    await addMember(asAdmin, admin, { name: "Einmal", email: address, role: "member" });
    expect(await addMember(asAdmin, admin, { name: "Zweimal", email: address, role: "member" })).toEqual({
      error: "Diese Adresse ist schon eingetragen.",
    });
  });

  it.each([
    ["member", () => asMember],
    ["deactivated admin", () => asInactiveAdmin],
  ])("%s may not add a member", async (_, as) => {
    const address = email("phase5-denied");
    expect(await addMember(as(), admin, { name: "X", email: address, role: "member" })).toEqual({ error: "Das dürfen nur Admins." });
    expect(await row(address)).toBeNull();
  });

  it("rejects invalid input", async () => {
    expect(await addMember(asAdmin, admin, { name: "", email: email("phase5-x"), role: "member" })).toHaveProperty("error");
    expect(await addMember(asAdmin, admin, { name: "X", email: "keine-adresse", role: "member" })).toHaveProperty("error");
    expect(await addMember(asAdmin, admin, { name: "X", email: email("phase5-y"), role: "owner" })).toHaveProperty("error");
  });
});

describe("setActive and setRole", () => {
  it("admin may deactivate and reactivate a member", async () => {
    const id = await createMember(email("phase5-toggle"), "member");
    expect(await setActive(asAdmin, id, false)).toEqual({ ok: true });
    expect((await admin.from("team_members").select("active").eq("id", id).single()).data?.active).toBe(false);
    expect(await setActive(asAdmin, id, true)).toEqual({ ok: true });
  });

  it("a deactivated member immediately sees nothing, even with a valid session", async () => {
    const address = email("phase5-locked");
    const id = await createMember(address, "member");
    const session = await signIn(address);
    expect((await getMember(session)).member).not.toBeNull();

    await setActive(asAdmin, id, false);
    expect((await getMember(session)).member).toBeNull();
    expect((await session.from("team_members").select("id")).data).toEqual([]);
  });

  it("admin may promote a member", async () => {
    const id = await createMember(email("phase5-promote"), "member");
    expect(await setRole(asAdmin, id, "admin")).toEqual({ ok: true });
    expect((await admin.from("team_members").select("role").eq("id", id).single()).data?.role).toBe("admin");
  });

  it("admin cannot deactivate or demote themselves", async () => {
    expect(await setActive(asAdmin, adminId, false)).toEqual({ error: "Du kannst dich nicht selbst deaktivieren." });
    expect(await setRole(asAdmin, adminId, "member")).toEqual({ error: "Du kannst dir die Admin-Rolle nicht selbst entziehen." });
    expect(await row(emails[0])).toMatchObject({ role: "admin", active: true });
  });

  it("member may not deactivate or promote anyone", async () => {
    expect(await setActive(asMember, adminId, false)).toEqual({ error: "Das dürfen nur Admins." });
    expect(await setRole(asMember, memberId, "admin")).toEqual({ error: "Das dürfen nur Admins." });
    expect(await row(emails[1])).toMatchObject({ role: "member", active: true });
  });
});
