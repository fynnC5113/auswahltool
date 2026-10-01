"use client";

// "Adressen kopieren" (Fynn, 30.09.2026): all addresses of a group, separated
// by semicolons, for the BCC field in Outlook.
import { useState } from "react";
import { okText, textButton } from "../../../ui";

export function CopyAddresses({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(emails.join("; "));
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  if (copied) {
    return (
      <span role="status" className={okText}>
        ✓ {emails.length} {emails.length === 1 ? "Adresse" : "Adressen"} kopiert
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" onClick={copy} className={textButton}>
        Adressen kopieren
      </button>
      {failed && <span className="text-small text-danger">Kopieren ging nicht. Markiere die Adressen von Hand.</span>}
    </span>
  );
}
