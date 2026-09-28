// Mail module (TECH_DESIGN 6.5): one sendMail() for every automatic mail.
// Both transports deliver the same MIME message: "gmail" via Nodemailer SMTP,
// "graph" via Microsoft Graph sendMail in MIME format from the function
// mailbox. Calendar invitations (ics) follow in Phase 12. Server only.
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";

export type MailTransport = "gmail" | "graph";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendOptions {
  /** Per round: rounds.mail_transport. */
  transport?: MailTransport;
  /** Per round: rounds.reply_to. Falls back to MAIL_REPLY_TO. */
  replyTo?: string;
}

export const FROM_NAME = "Law Clinic Orga-Team";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (.env.local or Vercel)`);
  return value;
}

/** Sender address of a transport: the Gmail account or the function mailbox. */
function senderAddress(transport: MailTransport): string {
  return requireEnv(transport === "graph" ? "GRAPH_MAILBOX" : "GMAIL_USER");
}

/** Message as handed to nodemailer: sender name and address, reply-to. */
export function buildMessage(mail: Mail, options: SendOptions = {}): SendMailOptions {
  return {
    from: { name: FROM_NAME, address: senderAddress(options.transport ?? "gmail") },
    replyTo: options.replyTo ?? requireEnv("MAIL_REPLY_TO"),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  };
}

// --- gmail -----------------------------------------------------------------

let gmail: Transporter | undefined;

function gmailTransporter(): Transporter {
  gmail ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: requireEnv("GMAIL_USER"), pass: requireEnv("GMAIL_APP_PASSWORD") },
  });
  return gmail;
}

async function sendViaGmail(message: SendMailOptions): Promise<string> {
  const info = await gmailTransporter().sendMail(message);
  const rejected = info.rejected ?? [];
  if (rejected.length > 0) {
    throw new Error(`Mail rejected for ${rejected.join(", ")}`);
  }
  return info.messageId;
}

// --- graph -----------------------------------------------------------------

const mime = nodemailer.createTransport({ streamTransport: true, buffer: true });

let graphToken: { value: string; expiresAt: number } | undefined;

/** App-only access token (client credentials), reused until shortly before it expires. */
async function graphAccessToken(): Promise<string> {
  if (graphToken && graphToken.expiresAt > Date.now() + 60_000) return graphToken.value;

  const tenant = encodeURIComponent(requireEnv("GRAPH_TENANT_ID"));
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: requireEnv("GRAPH_CLIENT_ID"),
      client_secret: requireEnv("GRAPH_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) {
    throw new Error(`Graph token request failed: ${response.status} ${await response.text()}`);
  }
  const token = (await response.json()) as { access_token: string; expires_in: number };
  graphToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return graphToken.value;
}

async function sendViaGraph(message: SendMailOptions): Promise<string> {
  const { message: raw, messageId } = await mime.sendMail(message);
  const mailbox = encodeURIComponent(requireEnv("GRAPH_MAILBOX"));
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${mailbox}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await graphAccessToken()}`,
      "Content-Type": "text/plain",
    },
    body: raw.toString("base64"),
  });
  // 202 Accepted: taken over for delivery, no response body.
  if (response.status !== 202) {
    throw new Error(`Graph sendMail failed: ${response.status} ${await response.text()}`);
  }
  return messageId;
}

/** Sends one mail and returns its Message-ID. Throws if it was not accepted. */
export async function sendMail(mail: Mail, options: SendOptions = {}): Promise<string> {
  const message = buildMessage(mail, options);
  return options.transport === "graph" ? sendViaGraph(message) : sendViaGmail(message);
}
