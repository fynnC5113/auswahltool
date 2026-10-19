// Phase 5: login link only for active team members (TECH_DESIGN 3), tested
// against "auswahltool-test". Sending is mocked; the link is redeemed for real.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { sendMail } from "@/lib/mail/send";
import { admin, createMember, deleteUsersByEmail, redeem, testEmail } from "@/test/supabase";
import { requestLoginLink } from "./login";
import { getMember } from "./member";

const active = testEmail("phase5-active");
const inactive = testEmail("phase5-inactive");
const send = vi.fn<typeof sendMail>();

beforeAll(async () => {
  await createMember(active, "member");
  await createMember(inactive, "member", false);
});
afterAll(() => deleteUsersByEmail([active, inactive]));

beforeEach(() => {
  send.mockReset().mockResolvedValue("<id@test>");
  vi.stubEnv("APP_URL", "https://auswahltool.example");
});

describe("requestLoginLink", () => {
  it("sends no mail to an unknown address", async () => {
    await requestLoginLink(testEmail("phase5-unknown"), admin, send);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends no mail to a deactivated member", async () => {
    await requestLoginLink(inactive, admin, send);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a working link to an active member, regardless of case and spaces", async () => {
    await requestLoginLink(`  ${active.toUpperCase()} `, admin, send);

    expect(send).toHaveBeenCalledTimes(1);
    const [mail] = send.mock.calls[0];
    expect(mail.to).toBe(active);
    // First name from team_members (createMember: "Test member").
    expect(mail.text).toMatch(/^Hallo Test,/);
    const link = new URL(mail.text.match(/https:\/\/\S+/)![0]);
    expect(`${link.origin}${link.pathname}`).toBe("https://auswahltool.example/auth/confirm");

    // Redeeming the token (what the "Anmelden" button does) gives a session of this member.
    const session = await redeem(link.searchParams.get("token_hash")!);
    const { member } = await getMember(session);
    expect(member?.email).toBe(active);
  });

  it("the same link works only once", async () => {
    await requestLoginLink(active, admin, send);
    const tokenHash = new URL(send.mock.calls[0][0].text.match(/https:\/\/\S+/)![0]).searchParams.get("token_hash")!;
    await redeem(tokenHash);
    await expect(redeem(tokenHash)).rejects.toThrow();
  });
});
