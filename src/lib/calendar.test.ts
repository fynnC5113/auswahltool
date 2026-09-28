import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, fold, slotUid, type CalendarEvent } from "./calendar";

const event = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  method: "REQUEST",
  slotId: "0f0e0d0c-0000-4000-8000-000000000001",
  sequence: 1,
  // 20.10.2026 10:00–10:45 in Berlin (summer time, UTC+2).
  startsAt: "2026-10-20T08:00:00.000Z",
  endsAt: "2026-10-20T08:45:00.000Z",
  summary: "Gespräch mit dem Orga-Team der Law Clinic",
  location: "Raum 0.23",
  description: "Dienstag, 20. Oktober 2026\nOrt: Raum 0.23",
  organizer: { name: "Law Clinic Orga-Team", email: "tool@gmail.com" },
  attendee: { name: "Mia Muster", email: "mia@law-school.de" },
  now: new Date("2026-10-01T12:00:00Z"),
  ...extra,
});

const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("buildIcs", () => {
  it("an invitation with fixed UID, sequence, UTC times, organizer and one attendee", () => {
    const ics = unfold(buildIcs(event()));
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain(`UID:${slotUid("0f0e0d0c-0000-4000-8000-000000000001")}\r\n`);
    expect(ics).toContain("SEQUENCE:1\r\n");
    expect(ics).toContain("DTSTAMP:20261001T120000Z\r\n");
    expect(ics).toContain("DTSTART:20261020T080000Z\r\n");
    expect(ics).toContain("DTEND:20261020T084500Z\r\n");
    expect(ics).toContain('ORGANIZER;CN="Law Clinic Orga-Team":mailto:tool@gmail.com\r\n');
    expect(ics).toContain('ATTENDEE;CN="Mia Muster";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:mia@law-school.de\r\n');
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(ics.match(/ATTENDEE/g)).toHaveLength(1);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("a cancellation keeps the UID and is marked cancelled", () => {
    const ics = buildIcs(event({ method: "CANCEL", sequence: 2 }));
    expect(ics).toContain("METHOD:CANCEL\r\n");
    expect(ics).toContain("STATUS:CANCELLED\r\n");
    expect(ics).toContain("SEQUENCE:2\r\n");
    expect(ics).toContain("UID:slot-0f0e0d0c-0000-4000-8000-000000000001@auswahltool\r\n");
  });

  it("winter time: 27.10. 10:00 in Berlin is 09:00 UTC", () => {
    const ics = buildIcs(event({ startsAt: new Date("2026-10-27T10:00:00+01:00").toISOString(), endsAt: new Date("2026-10-27T10:45:00+01:00").toISOString() }));
    expect(ics).toContain("DTSTART:20261027T090000Z\r\n");
  });

  it("escapes text and keeps names from breaking parameters", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const ics = unfold(buildIcs(event({ attendee: { name: 'Anna "Nana" Müller,\nX', email: "a@b.de" } })));
    expect(ics).toContain('ATTENDEE;CN="Anna Nana Müller,X";');
  });

  it("every line has at most 75 octets, umlauts are not split", () => {
    const long = "Bewerbungsgespräch mit Jürgen Müller-Lüdenscheidt, zusammen mit Björn Österreicher und Änne Übermut.";
    const ics = buildIcs(event({ description: long.repeat(3) }));
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`DESCRIPTION:${escapeText(long.repeat(3))}\r\n`);
    expect(fold("kurz")).toBe("kurz");
  });
});
