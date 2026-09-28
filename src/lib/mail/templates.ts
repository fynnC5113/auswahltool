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
      `${use} Später buchst du dort auch deinen Gesprächstermin:\n${url}`,
      "Bitte gib den Link nicht weiter, er ist dein Zugang zu deiner Bewerbung.",
      "Viele Grüße\nLaw Clinic Orga-Team",
    ].join("\n\n"),
    html: html([
      `Hallo ${escapeHtml(name)},`,
      "vielen Dank für deine Bewerbung für das Orga-Team der Law Clinic. Sie ist bei uns eingegangen.",
      `${escapeHtml(use)} Später buchst du dort auch deinen Gesprächstermin:<br>${link(url, "Zu deiner Bewerbung")}`,
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
