// Phase 4 check: sends both templates for real via Gmail. Skipped unless a
// recipient is given, so "npm test" never sends mail:
//   MAIL_LIVE_TO=you@example.com npx vitest run src/lib/mail/live.test.ts
import { describe, expect, it } from "vitest";
import { sendMail } from "./send";
import { applicationReceivedMail, loginLinkMail } from "./templates";

const to = process.env.MAIL_LIVE_TO;

describe.skipIf(!to)("live mail via Gmail", () => {
  it("sends the login link template", async () => {
    const mail = loginLinkMail({ url: "https://auswahltool.vercel.app/auth/confirm?test=phase4" });
    expect(await sendMail({ to: to!, ...mail })).toBeTruthy();
  });

  it("sends the application received template", async () => {
    const mail = applicationReceivedMail({
      name: "Testbewerber",
      url: "https://auswahltool.vercel.app/b/test-phase4",
      closesAt: new Date("2026-10-15T21:59:00Z"),
    });
    expect(await sendMail({ to: to!, ...mail })).toBeTruthy();
  });
});
