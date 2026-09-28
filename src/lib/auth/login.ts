// Team login (TECH_DESIGN 3): a magic link generated on the server and sent
// by our own mail module. Unknown or deactivated addresses get the same
// answer, but no mail.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail, type MailTransport } from "@/lib/mail/send";
import { loginLinkMail } from "@/lib/mail/templates";

export const LOGIN_SENT_MESSAGE =
  "Wenn die Adresse im Team eingetragen ist, ist der Login-Link unterwegs. Bitte schau auch im Junk-Ordner nach.";

/** Team addresses are stored in lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Base URL for links in mails. From configuration, never from the request. */
export function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL must be set (.env.local or Vercel)");
  return url;
}

export async function requestLoginLink(email: string, admin: SupabaseClient, send = sendMail): Promise<void> {
  const address = normalizeEmail(email);
  if (!address) return;

  const { data: member, error } = await admin
    .from("team_members")
    .select("id")
    .eq("email", address)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) return;

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: address });
  if (link.error) throw new Error(link.error.message);
  const url = new URL("/auth/confirm", appUrl());
  url.searchParams.set("token_hash", link.data.properties.hashed_token);

  // Transport and reply-to of the latest round; Gmail and MAIL_REPLY_TO before the first round.
  const { data: round } = await admin
    .from("rounds")
    .select("mail_transport, reply_to")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ mail_transport: MailTransport; reply_to: string }>();

  await send(
    { to: address, ...loginLinkMail({ url: url.toString() }) },
    round ? { transport: round.mail_transport, replyTo: round.reply_to } : {},
  );
}
