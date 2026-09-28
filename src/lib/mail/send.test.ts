import nodemailer from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMessage } from "./send";

const mail = { to: "bewerber@example.com", subject: "Betreff", text: "Text", html: "<p>Text</p>" };

/** Renders the message as raw RFC 822 without sending it. */
async function render(options: Parameters<typeof buildMessage>[1] = {}): Promise<string> {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await transporter.sendMail(buildMessage(mail, options));
  return info.message.toString();
}

beforeEach(() => {
  vi.stubEnv("GMAIL_USER", "tool@gmail.com");
  vi.stubEnv("MAIL_REPLY_TO", "funktionspostfach@example.org");
  vi.stubEnv("GRAPH_TENANT_ID", "tenant-1");
  vi.stubEnv("GRAPH_CLIENT_ID", "client-1");
  vi.stubEnv("GRAPH_CLIENT_SECRET", "secret-1");
  vi.stubEnv("GRAPH_MAILBOX", "termin@example.org");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buildMessage", () => {
  it("sends as 'Law Clinic Orga-Team' from the Gmail address", async () => {
    expect(await render()).toMatch(/^From: "?Law Clinic Orga-Team"? <tool@gmail\.com>$/m);
  });

  it("sends from the function mailbox via graph", async () => {
    expect(await render({ transport: "graph" })).toMatch(/^From: "?Law Clinic Orga-Team"? <termin@example\.org>$/m);
  });

  it("sets Reply-To to the function mailbox by default", async () => {
    expect(await render()).toMatch(/^Reply-To: funktionspostfach@example\.org$/m);
  });

  it("uses the reply-to of the round when given", async () => {
    expect(await render({ replyTo: "runde@example.org" })).toMatch(/^Reply-To: runde@example\.org$/m);
  });

  it("adds a calendar invitation as text/calendar with its method", async () => {
    const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const content = "BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nEND:VCALENDAR\r\n";
    const info = await transporter.sendMail(buildMessage({ ...mail, ics: { method: "CANCEL", content } }));
    const raw = info.message.toString();
    expect(raw).toMatch(/^Content-Type: text\/calendar; charset=utf-8; method=CANCEL$/m);
    expect(raw).toContain("termin.ics");
    // Without an invitation there is no calendar part.
    expect(await render()).not.toContain("text/calendar");
  });

  it("fails without GMAIL_USER", () => {
    vi.stubEnv("GMAIL_USER", "");
    expect(() => buildMessage(mail)).toThrow("GMAIL_USER");
  });

  it("fails without GRAPH_MAILBOX for graph", () => {
    vi.stubEnv("GRAPH_MAILBOX", "");
    expect(() => buildMessage(mail, { transport: "graph" })).toThrow("GRAPH_MAILBOX");
  });
});

describe("sendMail via graph", () => {
  const tokenResponse = () =>
    new Response(JSON.stringify({ token_type: "Bearer", expires_in: 3599, access_token: "token-1" }), { status: 200 });

  /** Fresh module per test, so the cached access token does not leak between tests. */
  async function load() {
    vi.resetModules();
    return import("./send");
  }

  it("gets an app-only token and posts the base64 MIME message to the mailbox", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendMail } = await load();

    expect(await sendMail(mail, { transport: "graph" })).toMatch(/^<.+>$/);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    const form = tokenInit.body as URLSearchParams;
    expect(Object.fromEntries(form)).toEqual({
      client_id: "client-1",
      client_secret: "secret-1",
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const [sendUrl, sendInit] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe("https://graph.microsoft.com/v1.0/users/termin%40example.org/sendMail");
    expect(sendInit.headers).toEqual({ Authorization: "Bearer token-1", "Content-Type": "text/plain" });
    const raw = Buffer.from(sendInit.body as string, "base64").toString();
    expect(raw).toMatch(/^To: bewerber@example\.com\r?$/m);
    expect(raw).toMatch(/^Reply-To: funktionspostfach@example\.org\r?$/m);
    expect(raw).toContain("Content-Type: text/plain");
    expect(raw).toContain("Content-Type: text/html");
  });

  it("reuses the token for the next mail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendMail } = await load();

    await sendMail(mail, { transport: "graph" });
    await sendMail(mail, { transport: "graph" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain("/sendMail");
  });

  it("reports a failed token request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("invalid_client", { status: 401 })));
    const { sendMail } = await load();

    await expect(sendMail(mail, { transport: "graph" })).rejects.toThrow("Graph token request failed: 401 invalid_client");
  });

  it("reports a rejected mail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('{"error":{"code":"ErrorAccessDenied"}}', { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendMail } = await load();

    await expect(sendMail(mail, { transport: "graph" })).rejects.toThrow("Graph sendMail failed: 403");
  });
});
