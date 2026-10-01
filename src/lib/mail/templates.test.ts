import { describe, expect, it } from "vitest";
import {
  applicationLinkMail,
  applicationReceivedMail,
  bookingCancelledMail,
  bookingConfirmedMail,
  bookNowMail,
  escapeHtml,
  formatBerlin,
  formatSlot,
  interviewCancelledMail,
  interviewInviteMail,
  loginLinkMail,
} from "./templates";

describe("formatBerlin", () => {
  it("shows summer time (CEST) in Europe/Berlin", () => {
    expect(formatBerlin(new Date("2026-10-15T21:59:00Z"))).toBe("Donnerstag, 15. Oktober 2026 um 23:59");
  });

  it("shows winter time (CET) in Europe/Berlin", () => {
    expect(formatBerlin(new Date("2026-11-12T17:00:00Z"))).toBe("Donnerstag, 12. November 2026 um 18:00");
  });
});

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`<b>"A" & 'B'</b>`)).toBe("&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;");
  });
});

describe("loginLinkMail", () => {
  const url = "https://auswahltool.vercel.app/auth/confirm?token_hash=abc&type=email";
  const mail = loginLinkMail({ name: "Fynn Clemens", url });

  it("contains the link in text and html", () => {
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(`href="${escapeHtml(url)}"`);
  });

  // 30.09.2026: "Login" and "nicht angefordert" went to junk. 01.10.2026: a
  // greeting and a link only went to junk too, so first name, purpose and sender line.
  it("greets by first name, says what the tool is for and ends with the sender line", () => {
    expect(mail.subject).toBe("Dein Zugang zum Auswahltool des Orga-Teams");
    expect(mail.text).toMatch(/^Hallo Fynn,/);
    expect(mail.text).toContain("Bewerbungen der aktuellen Runde");
    expect(mail.text).toContain("Jungiusstraße 6 · 20355 Hamburg");
    expect(mail.text).not.toMatch(/login|angefordert/i);
  });

  it("escapes the name and falls back to 'Hallo,' without one", () => {
    expect(loginLinkMail({ name: "<b>Eve</b> X", url }).html).toContain("Hallo &lt;b&gt;Eve&lt;/b&gt;,");
    expect(loginLinkMail({ url }).text).toMatch(/^Hallo,\n/);
  });
});

describe("links in mails", () => {
  it("show the full address as link text", () => {
    const url = "https://lawclinic-bewerbung.vercel.app/b/token?x=1&y=2";
    const mails = [
      loginLinkMail({ url }),
      applicationReceivedMail({ name: "Anna", url, closesAt: null }),
      applicationLinkMail({ name: "Anna", url }),
      bookNowMail({ name: "Anna", url }),
    ];
    for (const mail of mails) {
      expect(mail.html).toContain(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    }
  });
});

describe("applicationReceivedMail", () => {
  const url = "https://auswahltool.vercel.app/b/token123";
  const mail = applicationReceivedMail({
    name: "Anna <script>",
    url,
    closesAt: new Date("2026-10-15T21:59:00Z"),
  });

  it("contains name, link and deadline", () => {
    expect(mail.text).toContain("Hallo Anna <script>,");
    expect(mail.text).toContain(url);
    expect(mail.text).toContain("15. Oktober 2026 um 23:59");
    expect(mail.html).toContain(`href="${url}"`);
  });

  it("escapes the name in html", () => {
    expect(mail.html).toContain("Hallo Anna &lt;script&gt;,");
    expect(mail.html).not.toContain("<script>");
  });
});

describe("applicationReceivedMail without deadline", () => {
  it("offers no editing after the deadline", () => {
    const mail = applicationReceivedMail({ name: "Anna", url: "https://x.example/b/t", closesAt: null });
    expect(mail.text).toContain("ansehen oder zurückziehen");
    expect(mail.text).not.toContain("ändern");
  });
});

describe("applicationLinkMail", () => {
  it("contains the new link, says old links are void, escapes the name", () => {
    const url = "https://auswahltool.vercel.app/b/new";
    const mail = applicationLinkMail({ name: "Anna <b>", url });
    expect(mail.text).toContain(url);
    expect(mail.text).toContain("gelten nicht mehr");
    expect(mail.html).toContain(`href="${url}"`);
    expect(mail.html).toContain("Anna &lt;b&gt;");
  });
});

describe("booking mails (Phase 12)", () => {
  const slot = { when: formatSlot(new Date("2026-10-20T08:00:00Z"), new Date("2026-10-20T08:45:00Z")), location: "Raum 0.23" };
  const url = "https://lawclinic-bewerbung.vercel.app/b/token";

  it("formats a slot with start and end in Berlin time", () => {
    expect(slot.when).toBe("Dienstag, 20. Oktober 2026, 10:00–10:45 Uhr");
  });

  it("confirmation: time, place, rebooking deadline and link", () => {
    const mail = bookingConfirmedMail({ name: "Mia", slot, url, rebookUntil: new Date("2026-10-19T08:00:00Z"), rebooked: false });
    expect(mail.subject).toBe("Dein Gesprächstermin ist gebucht");
    expect(mail.text).toContain(slot.when);
    expect(mail.text).toContain("Ort: Raum 0.23");
    expect(mail.text).toContain("Bis zum Montag, 19. Oktober 2026 um 10:00");
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(`href="${url}"`);
  });

  it("confirmation without link (entered by an admin) points to the first mail", () => {
    const mail = bookingConfirmedMail({ name: "Mia", slot, rebookUntil: new Date(), rebooked: false });
    expect(mail.text).toContain("aus unserer ersten Mail");
    expect(mail.html).not.toContain("href");
  });

  it("rebooking and cancellation have their own subjects", () => {
    expect(bookingConfirmedMail({ name: "Mia", slot, url, rebookUntil: new Date(), rebooked: true }).subject).toBe("Dein neuer Gesprächstermin");
    expect(bookingCancelledMail({ name: "Mia", slot, rebooked: true }).text).toContain("umgebucht");
    expect(bookingCancelledMail({ name: "Mia", slot, rebooked: false }).text).toContain("vom Orga-Team abgesagt");
  });

  it("interviewers: applicant, partner, time and place; names are escaped in html", () => {
    const invite = interviewInviteMail({ memberName: "Anna", applicantName: "<Mia>", partnerName: "Ben", slot, url });
    expect(invite.subject).toBe("Gespräch mit <Mia>");
    expect(invite.text).toContain("mit Ben");
    expect(invite.html).toContain("&lt;Mia&gt;");
    expect(invite.html).not.toContain("<Mia>");
    expect(interviewCancelledMail({ memberName: "Anna", applicantName: "Mia", slot }).subject).toBe("Abgesagt: Gespräch mit Mia");
  });

  it("book now: the new link, older links stop working", () => {
    const mail = bookNowMail({ name: "Mia", url });
    expect(mail.text).toContain(url);
    expect(mail.text).toContain("Frühere Links");
  });
});
