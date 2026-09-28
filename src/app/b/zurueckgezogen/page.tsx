// After a withdrawal (actions.ts redirects here). A page of its own, because
// the applicant page itself can only say "Link ungültig" once the data is gone.
import type { Metadata } from "next";
import { page } from "../../ui";

export const metadata: Metadata = { title: "Bewerbung zurückgezogen", robots: { index: false, follow: false } };

export default function WithdrawnPage() {
  return (
    <main className={page}>
      <h1 className="mb-4 text-2xl font-semibold">Bewerbung zurückgezogen</h1>
      <p>Deine Bewerbung und dein Lebenslauf sind endgültig gelöscht. Dein bisheriger Link funktioniert nicht mehr.</p>
    </main>
  );
}
