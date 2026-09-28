import nodemailer from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMessage, sendMail } from "./send";

const mail = { to: "bewerber@example.com", subject: "Betreff", text: "Text", html: "<p>Text</p>" };

/** Renders the message as raw RFC 822 without sending it. */
async function render(options: Parameters<typeof buildMessage>[1] = {}): Promise<string> {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await transporter.sendMail(buildMessage(mail, options));
  return info.message.toString();
}

describe("mail module", () => {
  beforeEach(() => {
    vi.stubEnv("GMAIL_USER", "tool@gmail.com");
    vi.stubEnv("MAIL_REPLY_TO", "funktionspostfach@example.org");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends as 'Law Clinic Orga-Team' from the Gmail address", async () => {
    expect(await render()).toMatch(/^From: "?Law Clinic Orga-Team"? <tool@gmail\.com>$/m);
  });

  it("sets Reply-To to the function mailbox by default", async () => {
    expect(await render()).toMatch(/^Reply-To: funktionspostfach@example\.org$/m);
  });

  it("uses the reply-to of the round when given", async () => {
    expect(await render({ replyTo: "runde@example.org" })).toMatch(/^Reply-To: runde@example\.org$/m);
  });

  it("fails without GMAIL_USER", () => {
    vi.stubEnv("GMAIL_USER", "");
    expect(() => buildMessage(mail)).toThrow("GMAIL_USER");
  });

  it("rejects transport 'graph' until Phase G", async () => {
    await expect(sendMail(mail, { transport: "graph" })).rejects.toThrow("not implemented");
  });
});
