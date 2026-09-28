// Mail templates (PRD 4.7). Pure functions: subject, plain text and HTML.
// Mails never contain CVs or ratings, only names, dates and links.
import type { Mail } from "./send";

type Content = Omit<Mail, "to">;

const berlin = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "full",
  timeStyle: "short",
});

/** "Donnerstag, 15. Oktober 2026 um 23:59" in Europe/Berlin. */
export function formatBerlin(date: Date): string {
  return berlin.format(date);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function html(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${p}</p>`).join("\n");
}

function link(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

export function loginLinkMail({ url }: { url: string }): Content {
  return {
    subject: "Dein Login-Link für das Auswahltool",
    text: [
      "Hallo,",
      `hier ist dein Login-Link für das Auswahltool des Orga-Teams:\n${url}`,
      "Der Link gilt nur einmal. Wenn du ihn nicht angefordert hast, kannst du diese Mail ignorieren.",
      "Law Clinic Orga-Team",
    ].join("\n\n"),
    html: html([
      "Hallo,",
      `hier ist dein Login-Link für das Auswahltool des Orga-Teams:<br>${link(url, "Zum Login")}`,
      "Der Link gilt nur einmal. Wenn du ihn nicht angefordert hast, kannst du diese Mail ignorieren.",
      "Law Clinic Orga-Team",
    ]),
  };
}

/** closesAt null: the application can no longer be changed (entered by an admin after the deadline). */
export function applicationReceivedMail({
  name,
  url,
  closesAt,
}: {
  name: string;
  url: string;
  closesAt: Date | null;
}): Content {
  const use = closesAt
    ? `Über deinen persönlichen Link kannst du deine Bewerbung ansehen, bis zum ${formatBerlin(closesAt)} ändern oder zurückziehen.`
    : "Über deinen persönlichen Link kannst du deine Bewerbung ansehen oder zurückziehen.";
  return {
    subject: "Deine Bewerbung für das Orga-Team der Law Clinic",
    text: [
      `Hallo ${name},`,
      "vielen Dank für deine Bewerbung für das Orga-Team der Law Clinic. Sie ist bei uns eingegangen.",
      `${use} Dort buchst du auch deinen Gesprächstermin:\n${url}`,
      "Bitte gib den Link nicht weiter, er ist dein Zugang zu deiner Bewerbung.",
      "Viele Grüße\nLaw Clinic Orga-Team",
    ].join("\n\n"),
    html: html([
      `Hallo ${escapeHtml(name)},`,
      "vielen Dank für deine Bewerbung für das Orga-Team der Law Clinic. Sie ist bei uns eingegangen.",
      `${escapeHtml(use)} Dort buchst du auch deinen Gesprächstermin:<br>${link(url, "Zu deiner Bewerbung")}`,
      "Bitte gib den Link nicht weiter, er ist dein Zugang zu deiner Bewerbung.",
      "Viele Grüße<br>Law Clinic Orga-Team",
    ]),
  };
}

/** Second application with the same address: a new link, the old one no longer works. */
export function applicationLinkMail({ name, url }: { name: string; url: string }): Content {
  return {
    subject: "Dein neuer Link zu deiner Bewerbung",
    text: [
      `Hallo ${name},`,
      "für deine Adresse gibt es bereits eine Bewerbung für das Orga-Team der Law Clinic. Deshalb wurde keine zweite angelegt.",
      `Hier ist dein neuer persönlicher Link. Über ihn kannst du deine Bewerbung ansehen, ändern oder zurückziehen:\n${url}`,
      "Frühere Links zu deiner Bewerbung gelten nicht mehr. Bitte gib den Link nicht weiter.",
      "Viele Grüße\nLaw Clinic Orga-Team",
    ].join("\n\n"),
    html: html([
      `Hallo ${escapeHtml(name)},`,
      "für deine Adresse gibt es bereits eine Bewerbung für das Orga-Team der Law Clinic. Deshalb wurde keine zweite angelegt.",
      `Hier ist dein neuer persönlicher Link. Über ihn kannst du deine Bewerbung ansehen, ändern oder zurückziehen:<br>${link(url, "Zu deiner Bewerbung")}`,
      "Frühere Links zu deiner Bewerbung gelten nicht mehr. Bitte gib den Link nicht weiter.",
      "Viele Grüße<br>Law Clinic Orga-Team",
    ]),
  };
}

// ---------------------------------------------------------------------------
// Phase 12: booking and calendar mails. Each goes with its own ics file
// (src/lib/booking.ts), one mail per recipient.
// ---------------------------------------------------------------------------

const clock = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

/** "Dienstag, 20. Oktober 2026, 10:00–10:45 Uhr" in Europe/Berlin. */
export function formatSlot(startsAt: Date, endsAt: Date): string {
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "full" }).format(startsAt);
  return `${day}, ${clock.format(startsAt)}–${clock.format(endsAt)} Uhr`;
}

export type SlotText = { when: string; location: string };

function both(lines: string[], htmlLines: string[]): Omit<Content, "subject"> {
  return { text: lines.join("\n\n"), html: html(htmlLines) };
}

/** To the applicant after booking or rebooking. Without url (entered by an admin) it points to the first mail. */
export function bookingConfirmedMail({
  name,
  slot,
  url,
  rebookUntil,
  rebooked,
}: {
  name: string;
  slot: SlotText;
  url?: string;
  rebookUntil: Date;
  rebooked: boolean;
}): Content {
  const intro = rebooked ? "du hast deinen Gesprächstermin geändert. Dein neuer Termin:" : "dein Gesprächstermin für das Orga-Team der Law Clinic ist gebucht:";
  const change = url
    ? `Bis zum ${formatBerlin(rebookUntil)} kannst du den Termin über deinen persönlichen Link ändern:`
    : `Bis zum ${formatBerlin(rebookUntil)} kannst du den Termin über deinen persönlichen Link aus unserer ersten Mail ändern.`;
  const body = both(
    [
      `Hallo ${name},`,
      `${intro}\n${slot.when}\nOrt: ${slot.location}`,
      url ? `${change}\n${url}` : change,
      "Die Einladung für deinen Kalender hängt an dieser Mail.",
      "Viele Grüße\nLaw Clinic Orga-Team",
    ],
    [
      `Hallo ${escapeHtml(name)},`,
      `${escapeHtml(intro)}<br><strong>${escapeHtml(slot.when)}</strong><br>Ort: ${escapeHtml(slot.location)}`,
      url ? `${escapeHtml(change)}<br>${link(url, "Zu deiner Bewerbung")}` : escapeHtml(change),
      "Die Einladung für deinen Kalender hängt an dieser Mail.",
      "Viele Grüße<br>Law Clinic Orga-Team",
    ],
  );
  return { ...body, subject: rebooked ? "Dein neuer Gesprächstermin" : "Dein Gesprächstermin ist gebucht" };
}

/** To the applicant: the old slot after rebooking, or removed by an admin. */
export function bookingCancelledMail({ name, slot, rebooked }: { name: string; slot: SlotText; rebooked: boolean }): Content {
  const what = rebooked
    ? "dieser Termin ist abgesagt, weil du auf einen neuen Termin umgebucht hast. Die Bestätigung für den neuen Termin kommt in einer eigenen Mail."
    : "dein Gesprächstermin wurde vom Orga-Team abgesagt. Über deinen persönlichen Link aus unserer ersten Mail kannst du einen neuen Termin buchen. Bei Fragen antworte einfach auf diese Mail.";
  const body = both([`Hallo ${name},`, `${what}\n\nAbgesagt: ${slot.when}, ${slot.location}`, "Viele Grüße\nLaw Clinic Orga-Team"], [
    `Hallo ${escapeHtml(name)},`,
    escapeHtml(what),
    `Abgesagt: ${escapeHtml(slot.when)}, ${escapeHtml(slot.location)}`,
    "Viele Grüße<br>Law Clinic Orga-Team",
  ]);
  return { ...body, subject: `Abgesagt: Gesprächstermin am ${slot.when}` };
}

/** To an interviewer: a booked interview (also a changed pair). */
export function interviewInviteMail({
  memberName,
  applicantName,
  partnerName,
  slot,
  url,
}: {
  memberName: string;
  applicantName: string;
  partnerName: string;
  slot: SlotText;
  url: string;
}): Content {
  const body = both(
    [
      `Hallo ${memberName},`,
      `du führst ein Bewerbungsgespräch:\nBewerber: ${applicantName}\n${slot.when}\nOrt: ${slot.location}\nmit ${partnerName}`,
      `Die Unterlagen findest du im Auswahltool:\n${url}`,
      "Die Einladung für deinen Kalender hängt an dieser Mail.",
      "Law Clinic Orga-Team",
    ],
    [
      `Hallo ${escapeHtml(memberName)},`,
      `du führst ein Bewerbungsgespräch:<br>Bewerber: ${escapeHtml(applicantName)}<br><strong>${escapeHtml(slot.when)}</strong><br>Ort: ${escapeHtml(slot.location)}<br>mit ${escapeHtml(partnerName)}`,
      `Die Unterlagen findest du im Auswahltool:<br>${link(url, "Zum Auswahltool")}`,
      "Die Einladung für deinen Kalender hängt an dieser Mail.",
      "Law Clinic Orga-Team",
    ],
  );
  return { ...body, subject: `Gespräch mit ${applicantName}` };
}

/** To an interviewer: the interview is off (rebooked, withdrawn, removed, pair changed). */
export function interviewCancelledMail({
  memberName,
  applicantName,
  slot,
}: {
  memberName: string;
  applicantName: string;
  slot: SlotText;
}): Content {
  const body = both(
    [`Hallo ${memberName},`, `dieses Gespräch findet für dich nicht statt:\nBewerber: ${applicantName}\n${slot.when}\nOrt: ${slot.location}`, "Der Termin wird aus deinem Kalender entfernt.", "Law Clinic Orga-Team"],
    [
      `Hallo ${escapeHtml(memberName)},`,
      `dieses Gespräch findet für dich nicht statt:<br>Bewerber: ${escapeHtml(applicantName)}<br>${escapeHtml(slot.when)}<br>Ort: ${escapeHtml(slot.location)}`,
      "Der Termin wird aus deinem Kalender entfernt.",
      "Law Clinic Orga-Team",
    ],
  );
  return { ...body, subject: `Abgesagt: Gespräch mit ${applicantName}` };
}

/** To applicants without a slot, sent by an admin. The link is new; older links stop working. */
export function bookNowMail({ name, url }: { name: string; url: string }): Content {
  const body = both(
    [
      `Hallo ${name},`,
      "du kannst jetzt deinen Termin für das Gespräch mit dem Orga-Team der Law Clinic buchen. Wähle dazu über deinen persönlichen Link einen freien Termin:",
      url,
      "Frühere Links zu deiner Bewerbung gelten nicht mehr. Bitte gib den Link nicht weiter.",
      "Viele Grüße\nLaw Clinic Orga-Team",
    ],
    [
      `Hallo ${escapeHtml(name)},`,
      `du kannst jetzt deinen Termin für das Gespräch mit dem Orga-Team der Law Clinic buchen. Wähle dazu über deinen persönlichen Link einen freien Termin:<br>${link(url, "Termin buchen")}`,
      "Frühere Links zu deiner Bewerbung gelten nicht mehr. Bitte gib den Link nicht weiter.",
      "Viele Grüße<br>Law Clinic Orga-Team",
    ],
  );
  return { ...body, subject: "Buche jetzt deinen Gesprächstermin" };
}
