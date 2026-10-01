// Phase 4 / G check: sends both templates for real. Skipped unless a
// recipient is given, so "npm test" never sends mail:
//   MAIL_LIVE_TO=you@example.com npx vitest run src/lib/mail/live.test.ts
// Add MAIL_LIVE_TRANSPORT=graph to send via the function mailbox,
// MAIL_LIVE_TRANSPORT=smtp via the SMTP_* server.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createToken } from "../applicant-token";
import { sendMail, type MailTransport } from "./send";
import { applicationReceivedMail, loginLinkMail } from "./templates";

const to = process.env.MAIL_LIVE_TO;
const transport = (process.env.MAIL_LIVE_TRANSPORT ?? "gmail") as MailTransport;
// Links in the real form (the spam filter weighs them); the tokens are random and do not work.
const app = "https://lawclinic-bewerbung.vercel.app";

describe.skipIf(!to)(`live mail via ${transport}`, () => {
  it("sends the login link template", async () => {
    const mail = loginLinkMail({ name: "Testperson Probe", url: `${app}/auth/confirm?token_hash=${randomBytes(28).toString("hex")}` });
    expect(await sendMail({ to: to!, ...mail }, { transport })).toBeTruthy();
  });

  it("sends the application received template", async () => {
    const mail = applicationReceivedMail({
      name: "Testbewerber",
      url: `${app}/b/${createToken()}`,
      closesAt: new Date("2026-10-15T21:59:00Z"),
    });
    expect(await sendMail({ to: to!, ...mail }, { transport })).toBeTruthy();
  });
});
