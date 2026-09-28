// Phase 12 check: sends a real calendar invitation (and, on request, its
// cancellation) to see whether it lands in the calendar. Skipped unless a
// recipient is given, so "npm test" never sends mail:
//   MAIL_LIVE_CAL_TO=you@example.com npx vitest run src/lib/mail/live-calendar.test.ts
// Add MAIL_LIVE_CAL_CANCEL=1 to send the cancellation of the same test entry,
// MAIL_LIVE_TRANSPORT=graph to send via the function mailbox.
import { describe, expect, it } from "vitest";
import { sendCancellations, sendInvitations, type SlotSnapshot } from "../calendar-mail";
import type { MailTransport } from "./send";

const to = process.env.MAIL_LIVE_CAL_TO;
const cancel = process.env.MAIL_LIVE_CAL_CANCEL === "1";
const transport = (process.env.MAIL_LIVE_TRANSPORT ?? "gmail") as MailTransport;

// A fixed id: the cancellation removes exactly the entry the invitation created.
const slot = (sequence: number): SlotSnapshot => ({
  id: "00000000-0000-4000-8000-00000000c0de",
  startsAt: "2026-10-20T08:00:00.000Z",
  interviewEndsAt: "2026-10-20T08:45:00.000Z",
  location: "Raum 0.23 (Test)",
  sequence,
  applicant: { id: "test", name: "Testbewerber", email: to ?? "" },
  interviewers: [],
  mail: { transport },
  rebookHoursBefore: 24,
});

describe.skipIf(!to)(`live calendar mail via ${transport}`, () => {
  it(cancel ? "sends the cancellation" : "sends the invitation", async () => {
    const failed = cancel
      ? await sendCancellations(slot(2), { applicant: { rebooked: false }, memberIds: [] })
      : await sendInvitations(slot(1), { applicant: { url: "https://lawclinic-bewerbung.vercel.app/b/test-phase12", rebooked: false }, memberIds: [] });
    expect(failed).toBe(0);
  });
});
