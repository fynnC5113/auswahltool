import { describe, expect, it } from "vitest";
import { applicationLinkMail, applicationReceivedMail, escapeHtml, formatBerlin, loginLinkMail } from "./templates";

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
  const mail = loginLinkMail({ url });

  it("contains the link in text and html", () => {
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(`href="${escapeHtml(url)}"`);
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
