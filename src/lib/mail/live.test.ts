// Phase 4 / G check: sends both templates for real. Skipped unless a
// recipient is given, so "npm test" never sends mail:
//   MAIL_LIVE_TO=you@example.com npx vitest run src/lib/mail/live.test.ts
// Add MAIL_LIVE_TRANSPORT=graph to send via the function mailbox.
import { describe, expect, it } from "vitest";
import { sendMail, type MailTransport } from "./send";
import { applicationReceivedMail, loginLinkMail } from "./templates";

const to = process.env.MAIL_LIVE_TO;
const transport = (process.env.MAIL_LIVE_TRANSPORT ?? "gmail") as MailTransport;

describe.skipIf(!to)(`live mail via ${transport}`, () => {
  it("sends the login link template", async () => {
    const mail = loginLinkMail({ url: "https://auswahltool.vercel.app/auth/confirm?test=phase4" });
    expect(await sendMail({ to: to!, ...mail }, { transport })).toBeTruthy();
  });

  it("sends the application received template", async () => {
    const mail = applicationReceivedMail({
      name: "Testbewerber",
      url: "https://auswahltool.vercel.app/b/test-phase4",
      closesAt: new Date("2026-10-15T21:59:00Z"),
    });
    expect(await sendMail({ to: to!, ...mail }, { transport })).toBeTruthy();
  });
});
