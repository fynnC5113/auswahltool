# Bauplan: Auswahltool Orga-Team

Grundlage: `PRD.md` und `TECH_DESIGN.md`. Das Tool wird schon in der **Runde 2026** eingesetzt. Deshalb ist der Plan nach den Terminen der Runde geordnet: Jede Etappe muss fertig sein, bevor die Runde sie braucht.

Ablauf pro Phase:
1. Plan-Mode (`Shift+Tab`)
2. Vorschlag prüfen
3. Umsetzen
4. Prüfung durchführen
5. Commit

Eine Phase gilt erst als fertig, wenn ihre **Prüfung** mit Beleg erfüllt ist: Testausgabe, Befehl mit Rückgabe oder Screenshot.

Entwickelt und getestet wird gegen `auswahltool-test`. Echte Daten liegen nur in `auswahltool-prod`.

## Termine der Runde 2026

| Datum | Ereignis |
| :---- | :---- |
| 29.09. | Gespräch mit Bian |
| **01.10.** | Beginn der Bewerbungsphase |
| ca. 15.10. | Ende der Bewerbungsphase |
| ca. 20.10. | erste Gespräche |
| ca. 05.11. | Auswahlsitzung (eine Woche vor dem Onboarding) |
| 12.11. | Onboarding |
| Löschdatum (noch festzulegen) | Löschung der Runde |

---

## Vorbereitung (Fynn, ohne Code)

- [x] Supabase-Konto anlegen (kostenlos)
- [x] Gmail-Konto nur für das Tool anlegen, Zwei-Faktor-Anmeldung einschalten und ein App-Passwort erzeugen (`lawclinic.orgateam@gmail.com`, 28.09.2026)
- [ ] **29.09.:** Gespräch mit Bian über den Einsatz mit echten Daten
- [ ] **bis 30.09.:** Text des Datenschutzhinweises (Zweck, wer die Daten sieht, Löschdatum). Entwurf von Claude am 28.09.2026 geliefert; offen sind verantwortliche Stelle, Datenschutzbeauftragte(r), Rechtsgrundlage, Versandweg und Löschdatum. Der Entwurf steht vorläufig in der Runde auf `-prod`; im Formular ausklappbar mit Pflicht-Checkbox „zur Kenntnis genommen“.
- [ ] **bis 30.09.:** Festlegen: Ende der Bewerbungsphase, Plätze, Löschdatum, Bewerbungsfragen und Ressorts 2026
- [ ] **bis 06.10.:** Feedback-Kriterien und ihre Gewichtung mit dem Team festlegen
- [ ] Anfrage an die Uni-IT zu Graph (siehe Phase G)

---

## Etappe A: Bewerbungsstart am 01.10.

- [x] **Phase 1: Projektgerüst und erste Veröffentlichung**
  - Ergebnis:
    - Next.js-App mit TypeScript, Tailwind und Vitest
    - zwei Supabase-Projekte (`-test`, `-prod`) in der **Region Frankfurt**
    - Vercel-Projekt mit Funktionsregion `fra1`
    - `.env.local` angelegt und in `.gitignore`
  - Prüfung:
    - `npm run build` läuft ohne Fehler.
    - `npm test` führt einen Beispieltest grün aus.
    - Die Vercel-Adresse ist im Browser erreichbar.
    - Beide Supabase-Projekte zeigen im Dashboard die Region Frankfurt (Screenshot).
    - `git status` zeigt keine `.env.local`.

- [x] **Phase 2: Alle Tabellen und Datenbankregeln**
  - Ergebnis: Migrationen für **alle** Tabellen aus TECH_DESIGN Abschnitt 4, damit spätere Etappen nicht umbauen müssen. Dazu gehören:
    - Kaskaden-Löschung ab `rounds`
    - Eindeutigkeit von `slots.applicant_id` und von Mail pro Runde
    - keine überlappenden Slots am selben Ort
    - privater Bucket `cv` (nur PDF, 10 MB)
  - Prüfung: Vitest gegen `-test` belegt:
    - Eine Doppelbuchung schlägt fehl.
    - Überlappende Slots am selben Ort schlagen fehl.
    - Das Löschen einer Runde entfernt alle abhängigen Zeilen.
    - Ein Upload einer Nicht-PDF oder einer Datei über 10 MB wird abgelehnt.

- [x] **Phase 3: Zugriffsregeln (RLS) mit Tests**
  - Ergebnis:
    - Die Hilfsfunktionen `is_member()` und `is_admin()`
    - Regeln für jede Tabelle nach TECH_DESIGN Abschnitt 5, einschließlich der Sichtsperre und der Board-Sperre
    - Regeln für den Storage-Bucket
  - Prüfung:
    - Eine Testsuite läuft grün. Sie enthält für jede Zeile der Tabelle in Abschnitt 5 einen Test „darf“ und einen Test „darf nicht“, geprüft als Admin, als Mitglied, als deaktiviertes Mitglied und ohne Anmeldung.
    - Die vier Bedingungen der Sichtsperre werden einzeln getestet.

- [ ] **Phase 4: Mail-Baustein (Gmail)**
  - Ergebnis:
    - `sendMail()` mit dem Weg `gmail`
    - Vorlagen für Login-Link und Eingangsbestätigung
    - Kalendereinladungen folgen erst in Phase 12.
  - Prüfung:
    - Ein Testskript schickt beide Vorlagen an Fynn. Sie kommen an, nicht im Spam, mit „Antwort an“ auf das Funktionspostfach (Screenshot).
    - **Prüfpunkt klären:** das Gmail-Sendelimit.

- [x] **Phase 5: Team-Login und Teamverwaltung**
  - Ergebnis:
    - `/login` und `/auth/confirm` mit Knopf „Anmelden“
    - Schutz aller Team-Seiten
    - `/einstellungen/team`: anlegen, deaktivieren, zu Admins machen
    - Der erste Admin wird per Skript angelegt.
  - Prüfung:
    - Fynn meldet sich mit dem Link aus der Mail an und bleibt nach einem Neustart des Browsers angemeldet.
    - Eine unbekannte Adresse bekommt dieselbe Meldung, aber keine Mail.
    - Ein deaktiviertes Testmitglied sieht sofort nichts mehr.
  - Belegt am 28.09.2026: Login per Mail-Link und Anmeldung nach Neustart von Chrome (Fynn, lokal mit Gmail-Adresse); Deaktivieren, Rolle und Selbstschutz (Screenshot); unbekannte/deaktivierte Adresse ohne Mail und deaktiviertes Mitglied sieht nichts (Vitest `src/lib/auth/login.test.ts`, `src/lib/team.test.ts`). Live auf auswahltool.vercel.app ebenfalls erfolgreich (Fynn). Login-Mails an @law-school.de: mit localhost-Link nicht angekommen (vermutlich Quarantäne), mit Live-Link angekommen; siehe Phase 4.

- [x] **Phase 6: Runde anlegen und konfigurieren**
  - Ergebnis: `/einstellungen/runde` mit allem aus PRD 4.2 sowie Versandweg, Antwortadresse und Datenschutzhinweis.
  - Prüfung:
    - Eine Testrunde wird mit 3 Fragen, 4 Ressorts und 3 gewichteten Kriterien angelegt und bearbeitet.
    - Ungültige Eingaben werden abgewiesen, zum Beispiel ein Ende vor dem Beginn oder ein Gewicht von 0.
  - Belegt am 28.09.2026: Vitest `src/lib/round.test.ts` gegen `-test` (Runde mit 3 Fragen, 4 Ressorts, 3 gewichteten Kriterien angelegt und bearbeitet; Umsortieren; Entfernen und Skalenänderung trotz vorhandener Daten verweigert, auch bei fremden Entwürfen; Mitglied und deaktivierter Admin dürfen nicht), `src/lib/round-form.test.ts` (Ende vor Beginn, Gewicht 0, leere Namen, Skala verkehrt, Löschdatum nicht nach Gesprächsende), `src/lib/berlin-time.test.ts` (Sommer-/Winterzeit, 25.10.2026); `npm test` 339 grün. Von Hand (Fynn, lokal): Gewicht 0 abgewiesen (Screenshot), Runde „Testlauf“ gespeichert und per Abfrage geprüft (Zeiten korrekt in UTC); Ende vor Beginn laut Fynn abgewiesen.

- [x] **Phase 7: Öffentliches Formular, persönliche Seite und Erfassung durch den Admin**
  - Ergebnis:
    - `/bewerben` mit Datenschutzhinweis und Bestätigungsseite (mit dem Hinweis, auch im Junk-Ordner nach der Mail zu sehen)
    - `/b/[token]`: ansehen, bis zur Frist ändern, zurückziehen
    - `/einstellungen/erfassen` als Ersatzweg
    - Eine schlichte Liste der Bewerbungen für Admins, zur Kontrolle ab dem 01.10.
  - Prüfung: Auf dem Handy wird eine Bewerbung abgeschickt, und die Mail mit dem Link kommt an. Außerdem gilt:
    - Eine Bearbeitung ist sichtbar.
    - Eine zweite Bewerbung mit derselben Adresse schickt einen neuen Link, und der alte zeigt die neutrale Fehlerseite.
    - Ein leeres Pflichtfeld, eine Nicht-PDF oder eine zu große PDF wird abgewiesen.
    - Vor und nach der Bewerbungsphase ist das Formular geschlossen.
    - Nach dem Zurückziehen sind der Bewerber in der Datenbank und die PDF im Bucket weg (Abfrage und Screenshot).
  - Belegt am 28.09.2026: Vitest `src/lib/application-form.test.ts` (Token, Fristfenster, Pflichtfelder, Nicht-PDF, über 10 MB, %PDF-Kopf) und `src/lib/application.test.ts` gegen `-test` (18 Tests: vollständige Bewerbung mit Mail; zweite Bewerbung derselben Adresse schickt neuen Link, alter findet nichts; getarnte Nicht-PDF abgewiesen und gelöscht; Bucket lehnt Word und über 10 MB ab; vor/nach der Phase geschlossen; Ändern bis Fristende, danach verweigert; Zurückziehen löscht Zeile, Antworten, alle Dateien; Admin-Erfassung nach Fristende; Mitglied darf nicht erfassen), RLS-Regel `save_application` für alle vier Rollen; `npm test` 385 grün. Von Hand auf dem Handy, live mit Runde „Testlauf“ (Fynn, Screenshots 19:22–19:32): Bewerbung abgeschickt und Mail angekommen (Antwort an Funktionspostfach), Bearbeitung sichtbar, leeres Pflichtfeld markiert, zweite Bewerbung → „Bewerbung schon vorhanden“ plus Mail mit neuem Link, alter Link → „Link ungültig“, Zurückziehen bestätigt; danach per Abfrage: keine Bewerberzeile, Ordner der Runde im Bucket `cv` leer. Vor Beginn geschlossen: live per Abruf von `/bewerben` belegt.

- [ ] **Phase 8: Produktivumgebung und Abnahme A**
  - Ergebnis:
    - Auf `-prod`: Migrationen, Bucket, Admin Fynn, Umgebungsvariablen in Vercel
    - Die echte Runde 2026 ist angelegt.
  - Prüfung:
    - Alle Tests laufen grün.
    - Eine Testbewerbung auf `-prod` geht vollständig durch und wird danach zurückgezogen. Danach ist die Datenbank leer.
    - Alle Zeilen aus PRD Abschnitt 7, die das Formular und den Login betreffen, sind von Hand geprüft.
  - Stand 28.09.2026, **Prüfung belegt, Haken fehlt nur wegen der Rundendaten:** `-prod` hat alle sieben Migrationen (Prüfabfrage: 19 Tabellen, alle mit RLS, 73 Policies, Bucket `cv` privat/10 MB/PDF, Spalte `privacy_confirmed_at`; Screenshot), Admins `fynn.clemens@law-school.de` und `fynn.clemens@gmail.com` (Skript), Vercel zeigt auf `-prod` (Redeploy „Ready“, Login live, leere Rundenseite, Upload landet im Bucket von `-prod`). `npm test` 387 grün. Testbewerbung vom Handy auf `-prod` (Screenshots 20:24–20:29): leeres Pflichtfeld markiert, Bewerbung mit Mail, Bearbeitung sichtbar, zweite Bewerbung → „Bewerbung schon vorhanden“ plus neuer Link, alter Link → „Link ungültig“, zurückgezogen; danach per Abfrage 0 Bewerber, 0 Antworten, 0 Dateien. Nicht-PDF lässt sich auf dem iPhone gar nicht auswählen; getarnte Nicht-PDF und über 10 MB belegt Vitest. Login live: unbekannte Adresse → neutrale Meldung, schon benutzter Link → Hinweis (Screenshots). Vor dem Beginn geschlossen: live per Abruf. Nach dem Ende geschlossen: nur Vitest (Ende liegt in der Zukunft). **Offen:** Runde „Runde 2026“ auf `-prod` hat vorläufige Werte (aus „Testlauf“, Beginn 01.10.2026 00:00, Ende 15.10.2026 23:59, Löschdatum 30.11.2026, Datenschutz-Entwurf mit eckigen Klammern). Nach dem Gespräch mit Bian trägt Fynn die echten Werte ein, dann abhaken.

> **Ausstiegspunkt 30.09. abends:** Ist Phase 8 nicht geprüft, geht die Ausschreibung wie bisher mit der Adresse für Bewerbungen per Mail raus. Das Formular wird nachgeschoben, sobald Etappe A steht. Bis dahin trägt der Admin eingehende Bewerbungen über `/einstellungen/erfassen` ein. Die Runde hängt nicht am Tool.

---

## Etappe B: Terminplanung bis ca. 14.10.

Die Bewerber sollen ab dem Ende der Bewerbungsphase buchen können. Die Verfügbarkeiten des Teams müssen vorher stehen.

- [ ] **Phase 9: Verfügbarkeit, Orte und Sperrzeiten**, Ziel **06.10.**
  - Ergebnis:
    - `/verfuegbarkeit` mit einem 15-Minuten-Raster zum Antippen und der Obergrenze, am Handy bedienbar
    - Orte und Sperrzeiten in `/terminplanung`
  - Prüfung:
    - Zwei Mitglieder tragen am Handy Verfügbarkeiten ein (Screenshot).
    - Eine Sperrzeit für 0.23 wird im Raster als belegt angezeigt.
    - Danach trägt das Team seine echten Verfügbarkeiten ein.
  - Stand 28.09.2026, **Prüfung belegt, Haken fehlt nur wegen der echten Einträge des Teams:** Commit `2b961df`, live. Vitest `src/lib/availability-grid.test.ts` (19: Raster 08:00–20:00, Winterzeit ab 25.10., Felder außerhalb abgewiesen, Sperrzeit-Überlappung, Obergrenze) und `src/lib/availability.test.ts` gegen `-test` (13: speichern und ändern, deaktiviertes Mitglied speichert nichts, Orte und Sperrzeiten nur Admin, Ende vor Beginn abgewiesen, Ort mit Termin nicht löschbar); `npm test` 419 grün. Von Hand auf `-prod` am Handy (Fynn, Screenshots 22:24–22:27): Ort 0.23 als Standard angelegt, Sperrzeit „Beratung“ im Raster grau; beide Konten (Gmail, Uni) je 8 Felder am 20.10. mit Obergrenze 2 bzw. 1 gespeichert, per Abfrage auf `-prod` bestätigt. **Offen:** Das Team trägt die echten Verfügbarkeiten ein, sobald der Gesprächszeitraum nach dem Gespräch mit Bian feststeht; dann abhaken.

- [x] **Phase 10: Slotvorschläge (Kernlogik)**
  - Ergebnis: Eine reine Funktion nach TECH_DESIGN 6.2.
  - Prüfung: Vitest-Fälle laufen grün:
    - Keine Verfügbarkeit ergibt keine Slots.
    - Sperrzeiten werden eingehalten.
    - Obergrenzen werden eingehalten.
    - Es gibt keine Überlappung pro Ort und keine pro Person.
    - Die Verteilung ist gleichmäßig.
    - Die Kapazität reicht nicht: Der Rest wird gemeldet.
    - 30 Bewerber und 12 Mitglieder laufen in weniger als 1 Sekunde.
  - Belegt am 28.09.2026: Vitest `src/lib/slot-proposals.test.ts` (18 grün, jedes Ergebnis zusätzlich gegen alle Regeln geprüft): keine Verfügbarkeit → keine Slots; Sperrzeiten; zweiter Ort bei gesperrtem Standardort; Obergrenzen inkl. bestehender Slots; keine Überlappung pro Ort (inkl. Puffer) und pro Person; gleichmäßig (6 Mitglieder, 9 Slots → je 3); Rest gemeldet; Puffer, der nicht auf 15 Minuten aufgeht; Winterzeit; „bevorzugt“; 30 Bewerber/12 Mitglieder/12 Tage in 112 ms. `npm test` 437 grün, Build fehlerfrei.
  - Festlegungen (Fynn, 28.09.2026): Der Slot belegt den Ort für Gespräch + Puffer (kein Termin im Puffer). Gesprächsführer müssen nur für die Gesprächszeit verfügbar sein, bekommen aber während ihres Puffers kein weiteres Gespräch. Belastung eines Paars = der stärker belastete der beiden, dann die Summe. Mitglieder können „bevorzugt“ sein (zählen nicht als belastet, gewinnen Gleichstand): Fynn will möglichst viele Gespräche führen.

- [x] **Phase 11: Terminplanung (Admin)**
  - Ergebnis: `/terminplanung` mit folgenden Funktionen:
    - Festlegungen (Fynn, 29.09.2026): Mit einem Klick entstehen alle möglichen Termine (Zeit + Ort, ohne Paar), sofort buchbar, auch während der Bewerbungsphase, keine Bestätigung. Das Paar wählt das Tool erst bei der Buchung (gleichmäßig nach gebuchten Gesprächen), der Admin kann es festlegen. Obergrenze zählt gebuchte Gespräche. TECH_DESIGN 6.2.
    - „Alle möglichen Termine erzeugen“, „Alle freien Termine löschen“, Termin anlegen, freie Termine ändern und löschen, Paar festlegen
    - Kapazitätsanzeige (Bewerbungen ohne Termin, freie und derzeit buchbare Termine)
    - einen Bewerber von Hand eintragen (das Tool wählt das Paar)
    - Markierung „bevorzugt“ pro Mitglied und Runde (Migration `20260929100000_scheduling.sql`, nur Admins)
    - Hinweise: befangener oder deaktivierter Gesprächsführer, nicht verfügbar, über der Obergrenze, Ort gesperrt, kein Paar mehr frei
  - Prüfung:
    - Aus den Testverfügbarkeiten entstehen Termine; 3 Bewerber werden eingetragen und bekommen ein Paar; die Kapazität zählt richtig.
    - Eine Änderung, die eine Überschneidung erzeugen würde (Ort oder Person), wird abgewiesen.
  - Belegt am 29.09.2026: Commit `0635624`, live. Migration `20260929100000_scheduling.sql` auf `-test` und `-prod` (Screenshots „Success“, auf `-prod` zusätzlich per Abfrage). Vitest `src/lib/slot-offers.test.ts` (18: alle möglichen Termine, zweiter Raum nur mit Leuten für ein zweites Paar, Sperrzeiten, Winterzeit, 12 Mitglieder/12 Tage unter 1 s; Paarwahl: gleichmäßig 6 Buchungen auf 4 → je 3, Obergrenze zählt Buchungen, Puffer, Befangenheit, „bevorzugt“), `src/lib/scheduling-rules.test.ts` (14), `src/lib/scheduling.test.ts` gegen `-test` (13: Termine erzeugen, 3 Bewerber eingetragen mit Paar, befangenes Mitglied übergangen, Kapazität, Überschneidung am Ort und pro Person abgewiesen, gebuchter Termin braucht Paar, „bevorzugt“ nur Admin), RLS-Regeln `set_preferred`; `npm test` 493 grün. Von Hand live auf `-prod` (Fynn, Screenshots): 2 Termine erzeugt (45-Minuten-Gespräche in 2 Stunden), Testbewerber eingetragen mit Paar, Kapazität 1/1/0/1/1, Termin am selben Ort zur selben Zeit abgewiesen.

- [ ] **Phase 12: Buchung, Umbuchung und Kalendermails**
  - Ergebnis:
    - Buchung und Umbuchung auf `/b/[token]`, schon während der Bewerbungsphase (Fynn, 29.09.2026); das Paar wählt `choosePair` bei der Buchung (TECH_DESIGN 6.2/6.3), bei gleichzeitigem Doppeleinsatz das nächste Paar
    - Obergrenze (gebuchte Gespräche) in der Datenbank prüfen (Migration)
    - Angeboten werden nur Termine, für die es ohne befangene Mitglieder ein Paar gibt.
    - Offene Frage an Fynn: Bekommen Bewerber, die sich vor dem Start der Buchung beworben haben, eine Mail „Jetzt Termin buchen“?
    - Hinweis „Mail an die Law Clinic“, wenn kein Slot passt
    - Kalendermails nach TECH_DESIGN 6.4 (ics)
  - Prüfung:
    - Nach einer Buchung haben der Bewerber und beide Gesprächsführer die Einladung im Kalender.
    - Nach einer Umbuchung ist der alte Termin weg und der neue da.
    - Nach der Umbuchungsfrist ist keine Umbuchung mehr möglich.
    - Zwei gleichzeitige Buchungen desselben Slots liefern genau einen Erfolg.
    - Ein Rückzug sagt den Termin bei den Gesprächsführern ab.

- [ ] **Phase 13: Bewerbungen im Team, Befangenheit und Übersicht; Abnahme B**
  - Ergebnis:
    - `/bewerbungen` mit Suche und Filter
    - `/bewerbungen/[id]` mit Antworten, PDF (signierter Link) und dem Knopf „Ich bin befangen“
    - Knopf „Bewerbung löschen“ für Admins (Fynn, 29.09.2026: etwa wenn jemand per Mail zurückzieht und keinen Link hat); gleiche Löschung wie der Rückzug auf `/b/[token]` (erst alle Dateien `<round_id>/<applicant_id>*`, dann die Zeile, Slot wird frei; ab Phase 12 Kalender-Absage an die Gesprächsführer), mit Rückfrage
    - Status „nicht erschienen“
    - `/` als Übersicht
  - Prüfung:
    - Die Suche findet Text aus den Antworten.
    - Ein Admin löscht eine Bewerbung: Zeile, Antworten und PDF sind weg, ihr Termin ist wieder frei; ein Mitglied sieht den Knopf nicht und darf nicht löschen.
    - Die PDF öffnet sich, ein abgelaufener Link nicht mehr.
    - Die Befangenheit ist für andere sichtbar und blendet die betroffenen Slots für diesen Bewerber aus.
    - Abnahme B: Auf `-test` läuft ein Durchlauf von der Verfügbarkeit bis zur Buchung mit Kalendereinladung.

---

## Etappe C: Feedback bis 19.10.

- [ ] **Phase 14: Meine Gespräche und Feedback; Abnahme C**
  - Ergebnis:
    - `/gespraeche` für das Handy
    - Feedback-Formular mit Entwurf und Abgabe
    - Sichtsperre in der Oberfläche
    - Admin-Übersicht über fehlendes Feedback mit „Sperre aufheben“
    - Knopf „Auswahlrunde starten“
  - Prüfung:
    - Am Handy dauert das Ausfüllen unter 3 Minuten.
    - A sieht den Eintrag von B erst nach der eigenen Abgabe, ein Dritter sieht ihn sofort.
    - Nach „Sperre aufheben“ und nach „Auswahlrunde starten“ ist der Eintrag sichtbar.

---

## Etappe D: Draft Board bis ca. 01.11.

- [ ] **Phase 15: Rechenregeln**
  - Ergebnis: Reine Funktionen für:
    - die Kurzbewertung (gewichtet, auf eine Skala umgerechnet)
    - die Zusammensetzungsleiste
    - die Board-Verschiebung mit Neunummerierung der Positionen
    - Rückgängig
  - Prüfung:
    - Vitest-Fälle laufen grün, darunter Kriterien mit unterschiedlicher Skala, fehlendes Feedback ergibt „–“, und ein Rückgängig stellt genau den vorherigen Zustand her.

- [ ] **Phase 16: Draft Board für einen Nutzer**
  - Ergebnis: `/board` mit
    - vier Zonen und Drag & Drop per Maus, Touch und Tastatur
    - Karten mit Name, Jahrgang, Ressort und Kurzbewertung
    - Detail-Seitenleiste: Feedback oben, Antworten und PDF darunter
    - Zusammensetzungsleiste
    - Ansicht für den Beamer
  - Prüfung: Mit 15 Testbewerbern auf N = 10 Plätzen:
    - Karten lassen sich in alle Zonen verschieben.
    - Die Reihenfolge von „Auch gern“ bleibt nach dem Neuladen erhalten.
    - Die Leiste stimmt mit einer Handzählung überein.

- [ ] **Phase 17: Board live, Verlauf, Einfrieren und Ergebnis; Abnahme D**
  - Ergebnis:
    - Realtime
    - Einblendung „wer, was, wohin“
    - Verlauf mit Rückgängig
    - Einfrieren durch einen Admin
    - `/board/ergebnis` mit den Gruppen Zusage, Nachrücker und Absage samt Adressen
  - Prüfung:
    - Zwei Browser und ein Handy verschieben gleichzeitig, und alle zeigen innerhalb von etwa 1 Sekunde denselben Stand (Bildschirmaufnahme).
    - Rückgängig funktioniert.
    - Nach dem Einfrieren wird jede Verschiebung abgewiesen, auch ein direkter Datenbankzugriff, belegt durch einen Test.
    - Die Ergebnisliste stimmt.
    - Abnahme D: eine Probe-Auswahlsitzung mit 3 Personen auf `-test`.
    - **Prüfpunkt klären:** Realtime mit mehreren Geräten.

---

## Etappe E: Löschung bis zum Löschdatum

- [ ] **Phase 18: Löschung, Erinnerung und Statistik; Abnahme E**
  - Ergebnis:
    - `/api/cron/daily` mit Schutzschlüssel
    - Vercel-Cron täglich
    - Erinnerung 7 Tage vorher
    - Löschung nach TECH_DESIGN 6.7 einschließlich `round_stats`
    - `/einstellungen/loeschung`
  - Prüfung:
    - Eine Testrunde mit dem Löschdatum heute wird über den manuell aufgerufenen Job gelöscht.
    - Danach sind die Tabellen der Runde und der Bucket-Pfad leer, und in `round_stats` steht eine Zeile (Abfragen und Screenshot).
    - Ein Aufruf ohne Schlüssel wird abgewiesen.
    - **Prüfpunkt klären:** Hält der Job Supabase wach?
    - Offene Prüfpunkte aus TECH_DESIGN Abschnitt 9 sind abgehakt oder ausdrücklich als offen notiert.

---

## Bedingte Phase

- [ ] **Phase G: Versandweg Microsoft Graph**, sobald die IT zugestimmt hat, jederzeit einschiebbar
  - Ergebnis: `sendMail()` mit dem Weg `graph`, umschaltbar pro Runde.
  - Prüfung:
    - Eine Testmail mit Kalendereinladung kommt mit dem Absender Funktionspostfach an.
    - Nach dem Zurückschalten läuft wieder alles über Gmail.
    - **Prüfpunkt klären:** Ablauf der IT-Freigabe.
