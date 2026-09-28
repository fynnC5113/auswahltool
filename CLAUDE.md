# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stand des Repos

Phase 1 bis 3 sind fertig: Next.js-Gerüst (Next.js 16, Tailwind 4, Vitest 5), alle Tabellen samt Bucket `cv` und alle RLS-Regeln auf `auswahltool-test` (Migrationen unter `supabase/migrations/`, auf `-prod` noch keine, das ist Phase 8). Nächste Phase: 4 (Mail-Baustein Gmail), braucht das Gmail-Konto mit App-Passwort von Fynn. Den aktuellen Stand zeigen die Checkboxen in `PLAN.md`.

- Repo: https://github.com/fynnC5113/auswahltool (privat)
- Live: https://auswahltool.vercel.app
- Supabase: `auswahltool-test` und `auswahltool-prod`, beide Central EU (Frankfurt)

Planung:

- `PRD.md`: was gebaut wird. Bei Widerspruch gilt die PRD vor `Konzept.md`.
- `TECH_DESIGN.md`: Stack, Datenmodell, RLS-Regeln, Abläufe, Routen. Maßgeblich für jede Implementierungsentscheidung.
- `PLAN.md`: Bauplan in Phasen 1–18 plus Phase G, nach den Terminen der Runde 2026 geordnet. Zur Orientierung, in welcher Phase das Projekt steht, dort die Checkboxen lesen.
- `Konzept.md`: Hintergrund und Begründungen (nicht versioniert).

Jede Phase in `PLAN.md` hat einen Abschnitt **Prüfung**. Eine Phase gilt erst mit Beleg als fertig (Testausgabe, Befehl mit Rückgabe oder Screenshot). Danach Commit.

## Befehle

- `npm run build`: Build
- `npm run lint`: ESLint
- `npm test`: Vitest (`vitest run`, Konfiguration in `vitest.config.mts`, Tests unter `src/**/*.test.ts`)
- einzelner Test: `npx vitest run <pfad>` bzw. `-t "<testname>"`
- Datenbanktests (`src/db/*.test.ts`) laufen gegen `auswahltool-test` mit den Schlüsseln aus `.env.local` (geladen in `vitest.config.mts`) und räumen ihre Daten selbst auf.
- RLS-Tests (`src/db/rls.test.ts`) melden Testnutzer ohne Mail an: `auth.admin.generateLink({ type: 'magiclink' })`, dann `verifyOtp({ token_hash: properties.hashed_token, type: 'email' })` mit dem Publishable Key. Neue Regeln dort mit `rule(name, erlaubteRollen, versuch)` ergänzen; das erzeugt je Rolle einen „may“/„may not“-Test.
- Migrationen: Supabase CLI (`npx supabase …`, Dev-Dependency), verknüpft mit `auswahltool-test` (ref `oxbryalllwtwxrisozeq`). `supabase db push` erreicht die Datenbank derzeit nicht (siehe Offene Nachweise); die Migrationen aus Phase 2 und 3 wurden deshalb von Fynn im SQL-Editor des Dashboards ausgeführt.

Entwickelt und getestet wird gegen das Supabase-Projekt `auswahltool-test`, echte Daten liegen nur in `auswahltool-prod`. Keine lokale Datenbank, kein Docker. Geheimnisse nur in `.env.local` (von `.env*` in `.gitignore` erfasst) und in den Vercel-Umgebungsvariablen. Vorlage mit den Variablennamen: `.env.example`.

**Deployment:** Vercel ist mit dem GitHub-Repo verbunden. Jeder Push auf `main` geht sofort live. Funktionsregion `fra1` steht in `vercel.json` und im Vercel-Dashboard.

**Supabase-Einstellungen** (bei beiden Projekten so angelegt):
- „Automatically expose new tables“ ist **aus**. Migrationen müssen für jede Tabelle ausdrücklich `GRANT`s an `anon`, `authenticated` bzw. `service_role` vergeben, sonst scheitern Abfragen trotz korrekter RLS-Regeln.
- „Automatic RLS“ ist **an**: Neue Tabellen im Schema `public` bekommen RLS automatisch eingeschaltet.
- Schlüssel im neuen Format: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`, darf in den Browser) und `SUPABASE_SECRET_KEY` (`sb_secret_…`, nur Server, umgeht RLS).

## Architektur (Kurzfassung von TECH_DESIGN)

Next.js App Router + TypeScript auf Vercel (Funktionsregion `fra1`), Supabase (Region Frankfurt) für Postgres, Auth, Storage und Realtime. Tailwind, mobile first. dnd kit für das Board, `ics` für Kalendereinladungen, Nodemailer/Gmail als erster Versandweg. Betrieb muss 0 € kosten: keine kostenpflichtigen Tarife, keine eigene Domain.

Drei Zugriffswege, die sich nicht vermischen dürfen:

1. **Team:** Alle Zugriffe laufen mit der Session des Mitglieds, **RLS entscheidet**. Keine Sicherheitslogik nur in der Oberfläche. Hilfsfunktionen `private.is_member()` / `private.is_admin()` prüfen immer auch `team_members.active`. Sie und die übrigen RLS-Hilfsfunktionen (`board_open`, `board_open_for_applicant`, `can_read_feedback`) liegen als `security definer` im Schema `private`, das die Data API nicht freigibt; nur `authenticated` darf sie ausführen. Alle Policies gelten nur `to authenticated`, `anon` hat weder Tabellenrechte noch Storage-Regeln. Festgelegt in Phase 3: Die eigene Befangenheit darf man wieder entfernen; das Einfrieren sperrt auch Feedback (inkl. Entwürfe); `board_positions` hat keine Delete-Regel (nur Kaskade).
2. **Bewerber** (`/b/[token]`): kein Konto. Der Server prüft das Token (gespeichert wird nur der SHA-256-Hash), danach Service-Role-Zugriff, **fest auf die `applicant_id` dieses Bewerbers begrenzt**. Der Service-Role-Schlüssel verlässt nie den Server.
3. **Öffentliches Formular** (`/bewerben`): schreibt nur über den Server, nach Prüfung von Frist, Pflichtfeldern, PDF-Typ und max. 10 MB.

Weitere Invarianten, die über mehrere Stellen verteilt sind:

- **Login:** `auth.admin.generateLink({ type: 'magiclink' })` ohne Supabase-Mailversand; der Link geht über den eigenen Mail-Baustein und führt auf `/auth/confirm` mit Knopf „Anmelden“ (Schutz vor Link-Scannern). Unbekannte oder deaktivierte Adressen bekommen dieselbe Meldung, aber keine Mail.
- **Löschung per Kaskade:** Alle Rundendaten hängen über `round_id` mit `on delete cascade` an `rounds`. PDFs im Bucket `cv` müssen **vorher** explizit gelöscht werden, die Kaskade erfasst den Storage nicht. `team_members` und `round_stats` überleben die Runde.
- **Rückzug eines Bewerbers** = sofortige endgültige Löschung (kein Status), Slot wird frei, Kalender-Absage an die Gesprächsführer.
- **Doppelbuchung** verhindert die Eindeutigkeit von `slots.applicant_id`; **Überschneidung am selben Ort** (inkl. Puffer) ein Exclusion Constraint. Fehler daraus werden in Nutzermeldungen übersetzt, nicht im Code vorab „nachgebaut“.
- **Sichtsperre** ist eine RLS-Leseregel auf `feedback` mit vier Freigabebedingungen (TECH_DESIGN 5). Entwürfe (`submitted_at` null) sieht nur der Verfasser.
- **Board:** `board_events` ist append-only; Rückgängig schreibt einen neuen Eintrag mit `undoes_event_id`. Eine Verschiebung ist eine Transaktion (Position + Neunummerierung + Event). Nach `board_frozen_at` lehnt die Datenbank Verschiebungen ab.
- **Kalender:** feste `uid` pro Slot, `ics_sequence` für Änderungen, `METHOD:CANCEL` für Absagen.
- **Mail-Baustein:** eine Funktion `sendMail({ to, subject, text, html, ics? })` mit Umsetzungen `gmail` und `graph`, wählbar pro Runde (`rounds.mail_transport`). Mails enthalten nie Lebensläufe oder Bewertungen.
- **Zeiten:** `timestamptz` speichern, in `Europe/Berlin` anzeigen. Verfügbarkeitsraster 15 Minuten.

Reine, mit Vitest testbare Funktionen (ohne Datenbank): Slotvorschläge (TECH_DESIGN 6.2), Kurzbewertung (4.3, Skalen vorher auf 0–1 normiert), Fristen, Token-Hash, Kalendertexte, Board-Verschiebung und Rückgängig. RLS wird gegen `auswahltool-test` getestet: pro Zeile der Tabelle in TECH_DESIGN 5 je ein „darf“ und „darf nicht“ als Admin, Mitglied, deaktiviertes Mitglied und anonym.

## Ausdrücklich nicht bauen

Siehe PRD Abschnitt 6: keine automatische Vorauswahl/KI-Bewertung, kein Export, keine Zu-/Absagemails aus dem Tool, keine Kalender-Synchronisation, keine Bewerberkonten, nur Deutsch als Oberflächensprache.

## Offene Prüfpunkte

TECH_DESIGN Abschnitt 9 listet unverifizierte Annahmen (Gmail-Sendelimit, Supabase-Pausierung, Realtime-Last, Graph-Freigabe, Vercel-DPA). Nicht als geklärt behandeln, bevor die zugehörige Phase sie abhakt.

Offene Nachweise aus abgeschlossenen Phasen:
- Phase 1: Dass Vercel-Funktionen tatsächlich in `fra1` laufen, ist nur per Einstellung belegt, noch nicht im Betrieb. Nachliefern mit der ersten Serverfunktion (Phase 4 oder 5), z. B. über `process.env.VERCEL_REGION`. `x-vercel-id` einer statischen Seite zeigt nur den Edge-Knoten.
- Phase 2: `npx supabase db push` scheitert mit „Connection timed out“ zu `aws-0-eu-central-1.pooler.supabase.com` (Adresse laut Dashboard korrekt), im Heimnetz und über den Handy-Hotspot; auch der temporäre Login-Role-Weg ohne Passwort scheiterte. Ursache unbekannt. Vor Phase 8 klären, dann die Migrationshistorie von `-test` mit `supabase migration repair --status applied <version>` nachtragen (Befehl vorher gegen die Doku prüfen).
- Phase 2: Beim Upload muss der `Blob` selbst den Typ `application/pdf` tragen; ein untypisierter Blob kommt als `application/octet-stream` an und wird vom Bucket abgelehnt. Relevant für Phase 7.
- Seit Phase 3 (festgestellt 28.09.2026): Im Build-Ordner `.next/types/` liegen iCloud-Doppel-Kopien (`… 2.ts`). `npx tsc --noEmit` meldet deshalb „Duplicate identifier“, obwohl der Quellcode fehlerfrei ist. Noch nicht bereinigt, bei Fynn nachfragen, bevor `.next` gelöscht wird. Kann auch `npm run build` stören.

## Session-Ende („Ende“)

Schreibt Fynn „Ende“, vor dem Schluss der Session diesen Ablauf durchgehen, damit eine neue Session ohne Verlust weitermachen kann:

1. **Git:** `git status` und Abgleich mit `origin/main`. Eigene Änderungen einzeln committen und pushen (Regeln aus der globalen CLAUDE.md). Nicht Eigenes nur benennen, nicht committen. Vorher daran denken: Ein Push auf `main` geht sofort live.
2. **PLAN.md:** Checkboxen entsprechen dem belegten Stand. Nur abhaken, was mit Beleg geprüft ist.
3. **CLAUDE.md:** „Stand des Repos“, Befehle, Einstellungen und „Offene Nachweise“ auf den Stand der Session bringen. Neue Festlegungen, die jede spätere Session kennen muss, gehören hierher.
4. **Gedächtnis:** Entscheidungen und Vorlieben aus der Session, die nicht ins Repo gehören, in Memory ablegen; erledigte oder falsche Einträge löschen.
5. **Bericht an Fynn:** Was geprüft und gesichert wurde (mit Befehlsausgabe als Beleg), was offen bleibt, womit die nächste Session anfängt. Danach die To-do-Liste.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
