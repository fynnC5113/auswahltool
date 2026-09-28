// Calendar invitations (TECH_DESIGN 6.4, RFC 5545/5546). Pure functions.
//
// Every slot has one fixed UID; ics_sequence rises with each change, so a
// calendar replaces or cancels the entry it already has. Each recipient gets
// their own file with only themselves as attendee, so nobody sees the
// addresses of the others. Times are written in UTC (…Z), which needs no
// time zone block and survives the change to winter time.

export type CalendarMethod = "REQUEST" | "CANCEL";

export type CalendarEvent = {
  method: CalendarMethod;
  slotId: string;
  sequence: number;
  startsAt: string;
  /** End of the interview (not of the buffer). */
  endsAt: string;
  summary: string;
  location: string;
  description: string;
  /** The sending address (Gmail account or function mailbox). */
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  /** DTSTAMP; injectable for tests. */
  now?: Date;
};

export const slotUid = (slotId: string) => `slot-${slotId}@auswahltool`;

/** 2026-10-20T08:00:00.000Z → 20261020T080000Z */
function utc(iso: string | Date): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** TEXT values: backslash, semicolon, comma and line breaks are escaped. */
export function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Parameter values (CN): quoted, without quotes, line breaks or control characters. */
function param(value: string): string {
  return `"${value.replace(/["\r\n\p{Cc}]/gu, "")}"`;
}

/** Lines longer than 75 octets are folded (CRLF + space), never inside a UTF-8 character. */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75 octets.
    const limit = parts.length ? 74 : 75;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent): string {
  const cancel = event.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Law Clinic Orga-Team//Auswahltool//DE",
    `METHOD:${event.method}`,
    "BEGIN:VEVENT",
    `UID:${slotUid(event.slotId)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utc(event.now ?? new Date())}`,
    `DTSTART:${utc(event.startsAt)}`,
    `DTEND:${utc(event.endsAt)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `LOCATION:${escapeText(event.location)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `ORGANIZER;CN=${param(event.organizer.name)}:mailto:${event.organizer.email}`,
    `ATTENDEE;CN=${param(event.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${event.attendee.email}`,
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
