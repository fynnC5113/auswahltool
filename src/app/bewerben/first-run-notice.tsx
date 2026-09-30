"use client";

// Note at the top of /bewerben for the first round with the tool (Bian and
// Fynn, 30.09.2026): first use, possible errors, the privacy notice, and
// applying by mail instead. Shown before and during the application phase.
import { link, sectionTitle } from "../ui";

export function FirstRunNotice({ replyTo, hasPrivacyNotice }: { replyTo: string; hasPrivacyNotice: boolean }) {
  const mail = <a className={`${link} break-all`} href={`mailto:${replyTo}`}>{replyTo}</a>;

  function openPrivacyNotice() {
    const details = document.getElementById("datenschutz");
    if (details instanceof HTMLDetailsElement) details.open = true;
  }

  return (
    <section className="flex flex-col gap-2 rounded-group bg-surface p-4">
      <h2 className={sectionTitle}>Bevor du loslegst</h2>
      <p className="text-note">
        Wir nutzen für die Bewerbung in diesem Jahr zum ersten Mal ein eigenes Tool. Falls dabei etwas nicht funktioniert, schreib uns bitte an {mail}.
      </p>
      {hasPrivacyNotice && (
        <p className="text-note">
          Wie wir mit deinen Daten umgehen, steht im{" "}
          <a className={link} href="#datenschutz" onClick={openPrivacyNotice}>
            Datenschutzhinweis
          </a>
          .
        </p>
      )}
      <p className="text-note">
        Wenn du das Tool nicht nutzen möchtest, kannst du deine Unterlagen (Lebenslauf und Antworten auf die Fragen) auch per Mail an {mail} schicken.
      </p>
    </section>
  );
}
