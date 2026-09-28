// Mail module (TECH_DESIGN 6.5): one sendMail() for every automatic mail.
// Transport "gmail" is built first; "graph" follows in Phase G, calendar
// invitations (ics) in Phase 12. Server only: reads the Gmail app password.
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

/** Message as handed to nodemailer: sender name, Gmail address, reply-to. */
export function buildMessage(mail: Mail, options: SendOptions = {}): SendMailOptions {
  return {
    from: { name: FROM_NAME, address: requireEnv("GMAIL_USER") },
    replyTo: options.replyTo ?? requireEnv("MAIL_REPLY_TO"),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  };
}

let gmail: Transporter | undefined;

function gmailTransporter(): Transporter {
  gmail ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: requireEnv("GMAIL_USER"), pass: requireEnv("GMAIL_APP_PASSWORD") },
  });
  return gmail;
}

/** Sends one mail and returns its Message-ID. Throws if it was not accepted. */
export async function sendMail(mail: Mail, options: SendOptions = {}): Promise<string> {
  const transport = options.transport ?? "gmail";
  if (transport === "graph") {
    throw new Error("Mail transport 'graph' is not implemented yet (Phase G)");
  }
  const info = await gmailTransporter().sendMail(buildMessage(mail, options));
  const rejected = info.rejected ?? [];
  if (rejected.length > 0) {
    throw new Error(`Mail rejected for ${rejected.join(", ")}`);
  }
  return info.messageId;
}
