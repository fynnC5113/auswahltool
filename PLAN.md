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
| 30.09. nachmittags | große Runde: alle Einstellungen der Runde festlegen |
| **01.10. 17:00** | Beginn der Bewerbungsphase |
| ca. 15.10. | Ende der Bewerbungsphase |
| ca. 20.10. | erste Gespräche |
| ca. 05.11. | Auswahlsitzung (eine Woche vor dem Onboarding) |
| 12.11. | Onboarding |
| Löschdatum (noch festzulegen) | Löschung der Runde |

---

## Vorbereitung (Fynn, ohne Code)

- [x] Supabase-Konto anlegen (kostenlos)
- [x] Gmail-Konto nur für das Tool anlegen, Zwei-Faktor-Anmeldung einschalten und ein App-Passwort erzeugen (`lawclinic.orgateam@gmail.com`, 28.09.2026)
- [x] **29.09.:** Gespräch mit Bian über den Einsatz mit echten Daten (laut Fynn sehr positiv; Wünsche siehe „Wünsche aus dem Gespräch mit Bian“)
- [ ] **30.09. nachmittags, große Runde:** alle Einstellungen der Runde gemeinsam festlegen (Punkte darunter). Beginn der Bewerbungsphase steht: 01.10.2026 17:00. Stand 30.09.2026 abends (Abfrage auf `-prod`): Fragen (3), Ressorts (5), Fristen (Bewerbung 01.10. 17:00 bis 15.10. 23:59, Gespräche 19.10.–08.11., Löschdatum 30.11.) eingetragen; Pflichtantworten 2 und Korrektur in Frage 1 laut Fynn eingetragen (nicht nachgeprüft). Offen: Datenschutzhinweis, Plätze (vorläufig 10) und Kriterien (vorläufig nur „Besondere Ressorteignung“) bespricht das Team.
- [x] **bis 01.10. vor der Vorstellung:** Text des Datenschutzhinweises (**erledigt 01.10.2026:** Fassung „ohne Vercel Pro“ nach Abgleich mit Art. 13 DSGVO und der Prüfliste des Skills `datenschutz` (damals `anwalt-de`), auf `-prod` eingetragen, per Abfrage identisch mit `Datenschutzhinweis 2026 (ohne Vercel Pro).txt` im Projektordner, nicht versioniert; Verantwortlicher Bucerius Law School gGmbH, DSB Dr. Uwe Nolte, Art. 6 Abs. 1 lit. f, Vercel ohne Garantie offen benannt; mit Vercel Pro ist der Satz zur Übermittlung zu ersetzen). (Zweck, wer die Daten sieht, Löschdatum). Entwurf von Claude am 28.09.2026 geliefert; offen sind verantwortliche Stelle, Datenschutzbeauftragte(r), Rechtsgrundlage, Versandweg und Löschdatum. **Der Entwurf (5 eckige Klammern, Abfrage 30.09.2026) ist seit 30.09. auf `/bewerben` öffentlich aufklappbar**, auch vor Beginn der Bewerbungsphase.
- [x] **bis 30.09.:** Festlegen: Ende der Bewerbungsphase, Löschdatum, Bewerbungsfragen und Ressorts 2026 (auf `-prod` per Abfrage 30.09.2026). Plätze: siehe unten.
- [ ] Plätze festlegen (Team; vorläufig 10)
- [ ] **bis 06.10.:** Feedback-Kriterien und ihre Gewichtung mit dem Team festlegen
- [x] Anfrage an die Uni-IT zu Graph (siehe Phase G): **abgelehnt am 30.09.2026**, weder Graph noch Allow-Liste für Gmail (Sicherheitsbedenken: produktives System mit Bewerbungsdaten ohne benannte Verantwortliche, Versionierung, Peer Review; kurze Vorlaufzeit). Entscheidung im Call am 30.09.: offen mit den Bewerbern kommunizieren und mit Gmail und den umgebauten Mails planmäßig weitermachen. **Uni-SMTP geprüft (01.10.2026):** Versand über `smtp.office365.com:587` mit Fynns Konto als `termin.lawclinic@law-school.de` scheitert an der Anmeldung (`535 5.7.3 Authentication unsuccessful`, Passwort laut Fynn richtig, Zwei-Faktor-Anmeldung an); die Uni bietet keine App-Kennwörter an (Screenshot mysignins.microsoft.com, „Anmeldemethode hinzufügen“ ohne „App-Kennwort“). Ohne IT also kein Uni-SMTP.

## Wünsche aus dem Gespräch mit Bian (29.09.2026)

Überlegungen und Vorschläge, noch nicht entschieden. Was wie umsetzbar ist, klären Fynn und Claude; gebaut wird erst nach Plan und Freigabe. Bis zur Entscheidung unter `/terminplanung` **keine Termine erzeugen** (ohne Termine kann niemand buchen; Bewerbungen gehen trotzdem ein). Ungeprüft: was `/b/[token]` zeigt, solange es keine Termine gibt.

1. **Nachträgliche Befangenheit bei gebuchtem Termin:** heute keine Automatik; Admin sieht „… ist bei diesem Bewerber befangen. Bitte neu besetzen.“ und tauscht das Paar (Absage/Einladung gehen automatisch). Ungeprüft: ob der Admin versehentlich wieder eine befangene Person eintragen kann.
2. **Gespräche im Block:** Viele wollen ihre Gespräche am Stück statt verstreut. Heute wählt `choosePair` nur nach Belastung, Tag und Nachbarschaft zählen nicht. Möglichkeiten: nur den Block als verfügbar eintragen (ohne Code); Block bei Gleichstand bevorzugen; eigener Haken „Gespräche lieber im Block“ (Claudes Empfehlung).
3. **Termine verdichten:** Bewerber sollen nicht 9, 11 und 15 Uhr buchen und dazwischen bleibt alles frei. Möglichkeiten: A) Admin gibt nur gewünschte Termine frei (ohne Code); B) pro Tag nur freie Termine direkt neben gebuchten anbieten (mit Ausweg für Bewerber ohne passenden Termin); C) Bewerber wählen mehrere Wunschtermine, das Tool verteilt gesammelt, Admin bestätigt. **Fynn:** Termine sollen schon **vor** Ende der Bewerbungsphase feststehen können, damit die Gespräche direkt am Tag danach beginnen können; C also nur in Wellen (z. B. alle paar Tage verteilen), nicht einmal nach Fristende. Fynn klärt mit Bian.
4. **Wenige Gesprächsführer mit vielen Gesprächen** (Bian: Vergleichbarkeit statt 20 Leute mit je einem Gespräch). Geht heute schon über „bevorzugt“ (zählt immer als unbelastet), begrenzt durch Obergrenze und Verfügbarkeit. Auffällig: Unter mehreren Bevorzugten verteilt `choosePair` nicht gleichmäßig, sondern nimmt die zuerst gelisteten (Reihenfolge in `members`), bis ihre Obergrenze erreicht ist. Offen: wer zum Kern gehört, welche Obergrenze.

Variante C in Wellen würde 2, 3 und 4 gemeinsam lösen, weil das Tool viele Wünsche auf einmal verteilt.

**Nachbar-Variante (Fynns Idee, 29.09.2026, Ausbau von B):** Bewerber sehen pro Tag und Ort nur freie Termine direkt vor oder nach bereits gebuchten; ohne Buchung einen Startpunkt (frühester Termin oder vom Admin gesetzt). Offen: wie viele Nachbarn sichtbar (Einstellung der Runde?), Ausweg für Bewerber mit festen Zeiten („alle Termine anzeigen“ oder „schreib uns“), Datenbank prüft, dass nur angebotene Termine buchbar sind. Dazu `choosePair`: Nachbartermin bevorzugt mit demselben Paar (Blöcke, Thema 2). Sofortige Buchung bleibt; deutlich kleiner als C. Claudes Empfehlung als Mittelweg. **Stand 30.09.2026:** Fynn bespricht 2–4 im Call mit weiteren Hauptamtlichen; bis zur Entscheidung weiter mit Phase 15, später anpassen. **Entschieden (Fynn, 30.09.2026 abends):** Im Call wurde nicht darüber gesprochen; Bian meinte, Fynn solle es nicht von ihr abhängig machen. Die Terminvergabe bleibt, wie sie ist (Phase 11/12).

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
  - **Stand 30.09.2026 (Commit `a891fd5`, live):** Die alte Anmeldemail landete beim Erstkontakt in fremden @law-school.de-Postfächern im Junk (Kopf bei Bian: `SFV:SPM`, `CAT:SPM`, `SCL:5`, SPF/DKIM/DMARC `pass`). Fynns eigenes Postfach ist als Testziel ungeeignet (`SFV:SFE`, Gmail-Adresse unter „Sichere Absender“). Probeversand mit Varianten: Bians Postfach „lernte“ im Lauf des Tests (dieselbe alte Mail später im Posteingang), deshalb zählt nur der Erstkontakt. Bei Viviane kam die umgebaute Fassung (ohne Reply-To, volle Adresse als Link-Text, neutrale Wortwahl) als erste Mail in den Posteingang, die alte danach in den Junk; bei Jan kamen die neue Eingangsbestätigung, die Terminbestätigung mit Kalendereinladung und die Absage als erste Mails im Posteingang an, Outlook trug den Termin ein und aus (alles laut Fynn, ohne Screenshot). Deshalb umgebaut: über Gmail **keine Antwortadresse** mehr (Antworten gehen an das Gmail-Konto), Links zeigen die volle Adresse, Texte ohne „Login“, „nicht angefordert“, „Bitte gib den Link nicht weiter“. Das Prüfkriterium „Antwort an Funktionspostfach“ entfällt damit. **Abhaken**, sobald ein Screenshot „Posteingang“ aus einem fremden Postfach vorliegt (z. B. von Fynns Test am 30.09. abends). Ungetestet in fremden Postfächern: „Deine Bewerbung …“ mit neuem Link, Aufforderung zum Buchen, Einladung und Absage an Gesprächsführer.

  - **Stand 01.10.2026 (Commit `bd28b94`, live): Versandweg der Runde 2026 ist `smtp` über `team@bls-lc.de`** (Leonhard Bläsis mailbox.org-Konto, Domain `bls-lc.de` bei netcup mit MX/SPF/DKIM/DMARC für mailbox.org; AVV mit Leonhard offen). Gmail bleibt Rückfallweg (Einstellungen → Runde → Versandweg). Belege: Eingangsbestätigung (heutiger Text) beim Erstkontakt in `fynn.clemens@law-school.de` im Posteingang, Kopf `spf=pass`, `dkim=pass`, `dmarc=pass`, `SCL:1`, `CAT:NONE` (mit `blaesi-betreuungen.de` und mit `bls-lc.de`); Kalendereinladung im Uni-Kalender eingetragen, Absage 11:42 verschickt; Anmelde-Link an `fynn.clemens@gmail.com` im Posteingang und funktioniert (Screenshot 11:45); Leonhard (Eingangsbestätigung) angekommen. Alte Fassung des Anmelde-Links (vor `a891fd5`: „Zum Login“, „nicht angefordert“, Reply-To Law School) über `blaesi-betreuungen.de` an Bian (10:57): **Junk** (Bian, 11:09), obwohl dieselbe Domain mit heutigem Text bei Fynn im Posteingang ankam; die heutigen Texte bleiben. **Heutiger Anmelde-Link über `team@bls-lc.de` an Bian (11:31): Junk durch den zentralen Filter** (Kopf: spf/dkim/dmarc/compauth pass, aber `SFV:SPM`, `CAT:SPM`, `SCL:5`, `OFR:SpamFilterAuthJ`, `dest:J`, `ucf:0`), während die Eingangsbestätigung über dieselbe Domain bei Fynn und Leonhard mit `SCL:1` ankam. Vermutung (nicht belegt): kurze Mail mit fast nur einem `vercel.app`-Link plus Domain ohne Ruf (seit 01.10. vormittags); Bians Postfach hatte um 10:57 schon eine Spam-Mail über mailbox.org gesehen. Bewerber-Mails nicht betroffen. **Umgebaut (Commit `0d48803`, live 01.10.2026):** Anmelde-Mail mit „Hallo <Vorname>,“ aus `team_members`, Satz zum Zweck, „funktioniert einmal“, Absenderzeile mit Anschrift, Betreff „Dein Zugang zum Auswahltool des Orga-Teams“. Test an das unbelastete Postfach `jan.ehgart@law-school.de` (14:15, „Hallo Jan,“): laut Jan **im Posteingang** (ausdrücklich bestätigt, ohne Screenshot oder Mailkopf). Bian hat ihre Mail von 11:31 als „Kein Junk“ markiert. Falls wieder Junk: eigene Adresse für das Tool auf `bls-lc.de` (Stufe 2, Absender und Link auf derselben Domain). Antwortadresse setzt `smtp` nicht, Antworten gehen an `team@bls-lc.de` (Weiterleitung ans Termine-Postfach offen); deshalb nicht abgehakt.

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

- [x] **Phase 8: Produktivumgebung und Abnahme A**
  - Ergebnis:
    - Auf `-prod`: Migrationen, Bucket, Admin Fynn, Umgebungsvariablen in Vercel
    - Die echte Runde 2026 ist angelegt.
  - Prüfung:
    - Alle Tests laufen grün.
    - Eine Testbewerbung auf `-prod` geht vollständig durch und wird danach zurückgezogen. Danach ist die Datenbank leer.
    - Alle Zeilen aus PRD Abschnitt 7, die das Formular und den Login betreffen, sind von Hand geprüft.
  - Stand 28.09.2026, **Prüfung belegt, Haken fehlt nur wegen der Rundendaten:** `-prod` hat alle sieben Migrationen (Prüfabfrage: 19 Tabellen, alle mit RLS, 73 Policies, Bucket `cv` privat/10 MB/PDF, Spalte `privacy_confirmed_at`; Screenshot), Admins `fynn.clemens@law-school.de` und `fynn.clemens@gmail.com` (Skript), Vercel zeigt auf `-prod` (Redeploy „Ready“, Login live, leere Rundenseite, Upload landet im Bucket von `-prod`). `npm test` 387 grün. Testbewerbung vom Handy auf `-prod` (Screenshots 20:24–20:29): leeres Pflichtfeld markiert, Bewerbung mit Mail, Bearbeitung sichtbar, zweite Bewerbung → „Bewerbung schon vorhanden“ plus neuer Link, alter Link → „Link ungültig“, zurückgezogen; danach per Abfrage 0 Bewerber, 0 Antworten, 0 Dateien. Nicht-PDF lässt sich auf dem iPhone gar nicht auswählen; getarnte Nicht-PDF und über 10 MB belegt Vitest. Login live: unbekannte Adresse → neutrale Meldung, schon benutzter Link → Hinweis (Screenshots). Vor dem Beginn geschlossen: live per Abruf. Nach dem Ende geschlossen: nur Vitest (Ende liegt in der Zukunft). **Offen:** Runde „Runde 2026“ auf `-prod` hat vorläufige Werte (aus „Testlauf“, Beginn 01.10.2026 00:00, Ende 15.10.2026 23:59, Löschdatum 30.11.2026, Datenschutz-Entwurf mit eckigen Klammern). Nach dem Gespräch mit Bian trägt Fynn die echten Werte ein, dann abhaken. **Stand 30.09.2026 abends:** Werte bis auf Datenschutzhinweis, Plätze und Kriterien eingetragen (siehe Vorbereitung). Abhaken, sobald der Datenschutzhinweis fertig ist und Fynns Probebewerbungen (Beginn kurz vorverlegt, danach zurück auf 01.10. 17:00) zurückgezogen sind; dann per Abfrage prüfen: 0 Bewerbungen, 0 Dateien, Beginn 17:00, Pflichtantworten 2.
  - **Abgehakt 01.10.2026** (Abfrage auf `-prod`, nur lesend): Runde 2026 mit Beginn 01.10. 17:00 (`application_opens_at` 15:00 UTC), Ende 15.10. 23:59, `required_answers` 2, `mail_transport` `smtp`, 0 Bewerbungen, Bucket `cv` leer, Datenschutzhinweis ohne Klammern, Kurznamen Termine/Anwälte/ÖA/Curriculum/SBS, Auswahlrunde nicht gestartet.

- [x] **Nachtrag 30.09.2026 (Call Fynn/Bian, Commit `97e9a0f`, live):**
  - `/bewerben` zeigt vor und während der Bewerbungsphase „Bevor du loslegst“: erster Einsatz des Tools, Kontakt bei Fehlern, Link, der den Datenschutzhinweis aufklappt, Bewerbung per Mail an die Antwortadresse als Alternative. Vor Beginn steht der Datenschutzhinweis darunter.
  - „Ich bin für alle Ressorts offen“ als erste Wahl, eigene Angabe (`applicants.department_all`), schließt einzelne Ressorts und „weiß ich noch nicht“ aus (Check-Constraint); im Team „für alle offen“ in Liste, Detail, Filter und Board-Zusammensetzung (`ALL`).
  - `rounds.required_answers` („Pflichtantworten“ auf `/einstellungen/runde`, leer = alle): Formular zeigt „Beantworte mindestens N der M Fragen“, `save_application` speichert nur nicht-leere Antworten und prüft das Minimum (`hint = 'answer_missing'`).
  - Migration `20261002100000_required_answers.sql` auf `-test` und `-prod` (laut Fynn „Success“; auf `-prod` beide Spalten per Abfrage bestätigt).
  - Prüfung: `npm test` 608 grün, 3 übersprungen, 1 Fehler nur durch Supabase-Ratenbegrenzung (`login.test.ts` danach einzeln 4/4 grün); `tsc`, Lint, Build ohne Fehler; live per Abruf: `/bewerben` zeigt „Bevor du loslegst“ und „Datenschutzhinweis lesen“. Formular selbst (alle Ressorts, „2 der 3“) live erst ab Beginn sichtbar, vorher über `/einstellungen/erfassen`.
  - QR-Code für `https://lawclinic-bewerbung.vercel.app/bewerben` im Projektordner (`QR-Code Bewerbung.png`/`.svg`, nicht versioniert), laut Fynn funktioniert er.

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

- [x] **Phase 12: Buchung, Umbuchung und Kalendermails**
  - Ergebnis:
    - Buchung und Umbuchung auf `/b/[token]`, schon während der Bewerbungsphase (Fynn, 29.09.2026); das Paar wählt `choosePair` bei der Buchung (TECH_DESIGN 6.2/6.3), bei gleichzeitigem Doppeleinsatz das nächste Paar
    - Obergrenze (gebuchte Gespräche) in der Datenbank prüfen (Migration)
    - Angeboten werden nur Termine, für die es ohne befangene Mitglieder ein Paar gibt.
    - „Jetzt Termin buchen“: Knopf in `/terminplanung`, den der Admin selbst auslöst (Fynn, 29.09.2026)
    - Hinweis „Mail an die Law Clinic“, wenn kein Slot passt
    - Kalendermails nach TECH_DESIGN 6.4 (ics)
  - Prüfung:
    - Nach einer Buchung haben der Bewerber und beide Gesprächsführer die Einladung im Kalender.
    - Nach einer Umbuchung ist der alte Termin weg und der neue da.
    - Nach der Umbuchungsfrist ist keine Umbuchung mehr möglich.
    - Zwei gleichzeitige Buchungen desselben Slots liefern genau einen Erfolg.
    - Ein Rückzug sagt den Termin bei den Gesprächsführern ab.
  - Festlegungen (Fynn, 29.09.2026): Angeboten und buchbar sind nur Termine, deren Umbuchungsfrist noch nicht vorbei ist. Admins dürfen die Obergrenze überschreiten (Hinweis bleibt), Bewerber nicht. Uhrzeit und Ort gebuchter Termine werden nicht geändert (austragen und neu eintragen). Kalenderdatei selbst gebaut (`src/lib/calendar.ts`), kein Paket `ics`. Seite: Variante A der Vorschau (alle Tage untereinander, Uhrzeiten als Kacheln).
  - Belegt am 29.09.2026: Commits `4d4ff3a` und `1dcb5f8`, live. Migration `20260930100000_booking.sql` (`public.book_slot`, nur `service_role`) auf `-test` und `-prod` (Screenshots „Success“, auf `-prod` zusätzlich per Aufruf: antwortet mit `slot_gone`). Vitest `src/lib/booking.test.ts` gegen `-test` (11: Angebot, Buchung mit Paar und drei Einladungen je mit eigener ics, nur Termine mit Paar ohne Befangene, Umbuchen gibt alten Termin frei und sagt ab, zwei gleichzeitige Buchungen → genau ein Erfolg, nach der Frist weder Buchen noch Umbuchen, Obergrenze in der Datenbank, Aufruf ohne Server-Schlüssel verweigert, Rückzug sagt nur den Gesprächsführern ab, „zum Buchen auffordern“ mit neuem Link und Wiederherstellung bei Mailfehler), `calendar.test.ts` (5), Regeln `pairFor`/`offersFor`, Vorlagen; `npm test` 520 grün, Build fehlerfrei. Probeversand an `fynn.clemens@law-school.de` (Screenshots 00:55/00:56): Einladung im Posteingang und von selbst im Outlook-Kalender, Absage markiert den Termin als „Abgesagt“ mit „Aus dem Kalender entfernen“. Live auf `-prod` (Fynn, Screenshots 01:04–01:15): Testbewerber gebucht (Bewerberseite, Kapazität 1/1/0/1/1, Bestätigung in Gmail mit Termin-Karte, Einladung im Outlook-Kalender), umgebucht (Absage alt, Einladung neu bei Bewerber und Gesprächsführern), zurückgezogen (Seite „Bewerbung zurückgezogen“, Absage nur an die Gesprächsführer; per Abfrage 0 Bewerber, 0 Dateien, Termine frei, `ics_sequence` 2). Umbuchungsfrist und Gleichzeitigkeit nur per Vitest.
  - Fehler bei der Prüfung behoben: Nach dem Zurückziehen zeigte die Seite „Link ungültig“ statt der Bestätigung (Neurendern im selben Aufruf, Ursache vermutlich das Auffrischen der Team-Session). Jetzt leitet die Server Action auf `/b/zurueckgezogen` weiter.
  - **Offen (nach dem Gespräch mit der IT):** Probe an eine zweite Law-School-Adresse, die den Absender nicht kennt; Fynns Postfach kennt ihn eventuell schon. Gmail trägt Einladungen nur ein, wenn der Empfänger das eingestellt hat (Karte mit Ja/Nein erscheint).

- [x] **Phase 13: Bewerbungen im Team, Befangenheit und Übersicht; Abnahme B**
  - Ergebnis:
    - `/bewerbungen` mit Suche und Filter
    - `/bewerbungen/[id]` mit Antworten, PDF (signierter Link) und dem Knopf „Ich bin befangen“
    - Knopf „Bewerbung löschen“ für Admins (Fynn, 29.09.2026: etwa wenn jemand per Mail zurückzieht und keinen Link hat); gleiche Löschung wie der Rückzug auf `/b/[token]` (erst alle Dateien `<round_id>/<applicant_id>*`, dann die Zeile, Slot wird frei; Kalender-Absage an die Gesprächsführer über `releaseForWithdrawal` in `src/lib/calendar-mail.ts`), mit Rückfrage
    - Status „nicht erschienen“
    - `/` als Übersicht
  - Prüfung:
    - Die Suche findet Text aus den Antworten.
    - Ein Admin löscht eine Bewerbung: Zeile, Antworten und PDF sind weg, ihr Termin ist wieder frei; ein Mitglied sieht den Knopf nicht und darf nicht löschen.
    - Die PDF öffnet sich, ein abgelaufener Link nicht mehr.
    - Die Befangenheit ist für andere sichtbar und blendet die betroffenen Slots für diesen Bewerber aus.
    - Abnahme B: Auf `-test` läuft ein Durchlauf von der Verfügbarkeit bis zur Buchung mit Kalendereinladung.
  - Festlegungen (Fynn, 29.09.2026): Seiten nach Variante A der Vorschau (ruhige Liste, Filter als drei Auswahlfelder, Bewerbung als lange Seite, Übersicht mit vier Zahlen). `/bewerbungen` für alle Mitglieder. Bei der Admin-Löschung bekommt der Bewerber keine Mail, nur die Gesprächsführer die Absage. Befangenheit nach der Buchung löst nichts automatisch aus, Admins sehen den Hinweis und teilen um. „Fehlendes Feedback“ in der Übersicht kommt mit Phase 14.
  - Belegt am 29.09.2026: Commit `b73c0bf`, live, keine Migration. Vitest `src/lib/applicant-filter.test.ts` (8: Suche in Antworten, Name, Mail, mehrere Wörter, Umlaute; Filter), `src/lib/round-phase.test.ts` (3), `src/lib/applicant-team.test.ts` gegen `-test` (8: Suche findet Antworttext, PDF-Link öffnet und abgelaufener nicht, Befangenheit für andere sichtbar und Termin mit festem Paar nicht mehr angeboten, Hinweis in der Übersicht, Status nur Admin, Mitglied darf nicht löschen, Admin-Löschung entfernt Zeile, Antworten und beide PDFs, gibt den Termin frei und sagt beiden Gesprächsführern ab); `npm test` 539 grün, 3 übersprungen (Probeversände), Build und Lint fehlerfrei. Von Hand live auf `-prod` am Handy (Fynn, Screenshots 08:52–08:54): Suche „Kaktus“ mit markiertem Antworttext, PDF geöffnet, „nicht erschienen“ in der Liste, Übersicht „Vor Beginn“, Löschen; danach per Abfrage 0 Bewerbungen, 0 Dateien. **Abnahme B** lokal gegen `-test` (Screenshots 09:02–09:10): Ort 0.23, Verfügbarkeit Gmail-Konto (Uni-Konto von Claude eingetragen, weil localhost-Links die Uni nicht erreichen), 2 Termine erzeugt, Bewerbung über `/bewerben`, Buchung 01.10. 10:00 mit Paar, Bestätigung an den Bewerber, Einladung an Gmail und im Outlook-Kalender (Posteingang, nicht Junk); „Ich bin befangen“ mit Hinweis auf der Bewerbung und in der Übersicht; Löschen mit Absage in Gmail („Aus Google Kalender entfernt“) und Outlook („Aus dem Kalender entfernen“); per Abfrage 0 Bewerbungen, 0 Dateien, Termin frei mit `ics_sequence` 2.

---

## Phase D: Design, Ziel 30.09. (vor dem Start der Bewerbungsphase)

- [x] **Phase D: DESIGN.md und Umstellung aller Seiten**
  - Festlegungen (Fynn, 29.09.2026): Vorschau mit zwei Richtungen (Artifact „Auswahltool Designrichtungen“), gewählt: **A „Klar“** (Apple-Listen, Systemschrift, Marineblau aus dem Logo, Weinrot nur für Fehler und endgültige Aktionen) **mit den Feldern und großen Zahlen aus B**. Der dunkle Modus bleibt. Bildmarke des Logos auf den öffentlichen Seiten und im Team-Menü.
  - Ergebnis:
    - `DESIGN.md` (Farben hell/dunkel, fünf Schriftstufen, Abstände, Bausteine, Muster, Handyregeln, „so ja / so nein“), von Fynn freigegeben
    - Farben als benannte Werte in `globals.css`, Bausteine zentral in `src/app/ui.ts`; keine `zinc-…`/`dark:`-Klassen mehr in den Seiten
    - alle Seiten umgestellt, zuerst `/bewerben`, `/b/[token]`, `/b/zurueckgezogen`, `/login`, `/auth/confirm`, dann alle Teamseiten; Funktion unverändert
    - `/newproject` um den Schritt DESIGN.md ergänzt (erledigt 29.09.2026)
  - Prüfung:
    - `npm test` unverändert grün, `npm run build` und `npm run lint` fehlerfrei
    - `grep` findet in `src/app` keine `zinc-`, `red-`, `amber-`, `green-`, `emerald-`- oder `dark:`-Klassen mehr
    - Bildschirmfotos jeder Seite in 390 und 1280 px, hell und dunkel (Claude, lokal gegen `-test`)
    - Fynn prüft live am Handy den Bewerberweg: Formular mit Upload, Bestätigungsmail, Buchung, Ändern, Rückzug (Screenshots), dazu Übersicht, Bewerbungen und Verfügbarkeit
    - nach dem 01.10. 00:00 an den Bewerberseiten nur noch Fehlerbehebungen
  - Belegt am 29.09.2026: Commit `dc4e53f`, live. `npm test` 539 grün, 3 übersprungen (wie vorher), `npm run build` und `npm run lint` fehlerfrei, `tsc` 0 Fehler in `src/`; Suche nach alten Farb-, Größen-, Rundungs- und `dark:`-Klassen in `src/app` ohne Treffer. Bildschirmfotos aller Seiten in 390 px hell/dunkel und von `/bewerben`, `/`, `/terminplanung` in 1280 px (Claude, lokal gegen `-test`; vier Kleinigkeiten behoben). Live auf `-prod` am Handy (Fynn, Screenshots 14:54–15:02, dunkel): Runde kurz geöffnet, Verfügbarkeit beider Konten, 2 Termine erzeugt, leeres Formular mit markierten Fehlern, Bewerbung abgeschickt, Mail im Gmail-Posteingang, Uhrzeit-Kacheln mit Leiste, gebucht, „Änderungen gespeichert.“; Rückzug und Aufräumen laut Fynn erfolgreich, danach per Abfrage auf `-prod`: 0 Bewerbungen, 0 Antworten, 0 Termine, 0 Verfügbarkeiten, 0 Befangenheiten, 0 Sperrzeiten, 0 Dateien, Beginn wieder 01.10.2026 00:00.

---

## Etappe C: Feedback bis 19.10.

- [x] **Phase 14: Meine Gespräche und Feedback; Abnahme C**
  - Festlegungen (Fynn, 29.09.2026): Vorschau „Feedback-Vorschau Phase 14“ (https://claude.ai/artifact/8peL6rxEmrqpaprSULH6dd), gewählt **Formular A** (alles auf einer Seite; Laptop zweispaltig mit Hakenliste und „Abgeben“ rechts, Handy mit Leiste unten). Laptop ist der häufigste Fall, Handy muss gut gehen. Feedback schreiben nur die beiden Gesprächsführer des Termins, ab Gesprächsbeginn. Beim Abgeben Pflicht: jede Skala, zu jeder Punktzahl eine Begründung, Gesamteindruck. Entwurf speichert automatisch beim Tippen. „Feedback fehlt“ zählt erst nach Gesprächsende; „nicht erschienen“ braucht kein Feedback. „Auswahlrunde starten“ lässt sich von Admins zurücknehmen, solange das Board nicht eingefroren ist (Fynn, 29.09.2026 nach der Abnahme; zuerst war „nicht rückgängig“ festgelegt). Belegt: Vitest `feedback.test.ts` 14/14 (Zurücknehmen nur Admin, sperrt wieder, einzeln aufgehobene Sperre bleibt, nach dem Einfrieren abgelehnt), Bildschirmfoto der Übersicht mit „Auswahlrunde zurücknehmen“. Keine Zeitvorgabe fürs Ausfüllen (Prüfung „unter 3 Minuten“ gestrichen).
  - Ergebnis:
    - `/gespraeche` (Heute, Kommende, Vorbei mit Stand), Menüeintrag „Gespräche“ (auch als Reiter unten)
    - Feedback-Formular mit Entwurf und Abgabe (`/gespraeche/[slotId]/feedback`)
    - Sichtsperre in der Oberfläche (`/bewerbungen/[id]`, Abschnitt „Feedback“)
    - Admin-Übersicht über fehlendes Feedback mit „Sperre aufheben“ (auch auf der Bewerbung)
    - Knopf „Auswahlrunde starten“ mit Rückfrage
    - Migration `20261001100000_feedback.sql`: Schreiben nur über `public.save_feedback`, `public.feedback_progress` für „Feedback fehlt“
  - Prüfung:
    - A sieht den Eintrag von B erst nach der eigenen Abgabe, ein Dritter sieht ihn sofort.
    - Nach „Sperre aufheben“ und nach „Auswahlrunde starten“ ist der Eintrag sichtbar.
    - Bewerber sehen kein Feedback (Zugriff ohne Anmeldung liest und schreibt nichts).
  - Belegt am 29.09.2026: Commit `a73661c`, live. Migration auf `-test` und `-prod` (laut Fynn „Success“; auf `-prod` per Abfrage bestätigt: beide Funktionen vorhanden, `save_feedback` ohne Anmeldung abgelehnt). Vitest `src/lib/feedback-rules.test.ts` (10), `src/lib/feedback.test.ts` gegen `-test` (13: Entwurf nur für den Verfasser, unvollständige Abgabe abgelehnt mit Liste, Dritter/zukünftiges Gespräch/Direktschreiben abgelehnt, A sieht B erst nach eigener Abgabe und Dritter sofort, abgegebenes Feedback bleibt vollständig, „Sperre aufheben“ nur Admin, „Feedback fehlt“ ohne nicht erschienene und zukünftige, Entwurf markiert, „Auswahlrunde starten“ nur Admin und einmal, eingefroren keine Änderung, ohne Anmeldung nichts lesbar oder speicherbar), `src/db/rls.test.ts` 270 (Direktschreiben für alle Rollen verboten). `npm test` 561 grün, 1 an „Request rate limit reached“ gescheitert und einzeln wiederholt grün (`team.test.ts` 10/10), 3 übersprungen. Build, Lint, `tsc` fehlerfrei. Fotos in 390 und 1280 px hell/dunkel lokal gegen `-test` mit Beispieldaten (danach entfernt); Formular im Browser ausgefüllt: Lücken markiert, Entwurf gespeichert, abgegeben, Dialog „Feedback abgegeben“. Menüzeile oben nach Messung verdichtet (sonst ragte sie mit acht Einträgen bei 1024 und 1280 px über den Rand). Live-Übersicht mit „Gespräche“, „Feedbacks fehlen“ und „Auswahlrunde“ (Fynn, Screenshot). **Abnahme C** lokal gegen `-test` (Feedback kann live erst ab Gesprächsbeginn 20.10. eingetragen werden): drei vergangene Gespräche mit Gmail-Konto (A) und Uni-Konto (B), B gab über `save_feedback` ab; dritte Person sah Bs Feedback sofort (Bildschirmfoto Claude). Fynn als A am Laptop (Screenshots 16:2x–16:3x): Lena gesperrt mit Hinweis, leeres „Abgeben“ markiert alle Felder, ausgefüllt und abgegeben (Dialog), danach beide Einträge nebeneinander; Tim nach „Sperre aufheben“ sichtbar ohne eigene Abgabe; Anna nach „Auswahlrunde starten“ sichtbar. Per Abfrage bestätigt: nur Tim `sight_lock_lifted`, `selection_started_at` 29.09. 16:32, Fynns Feedback nur zu Lena. Danach aufgeräumt: 0 Bewerbungen, 0 Feedback, dritte Person gelöscht, `selection_started_at` wieder leer. Handy-Ansicht belegt durch Bildschirmfotos in 390 px; am echten Handy live erst mit den ersten Gesprächen.

---

## Etappe D: Draft Board bis ca. 01.11.

- [x] **Phase 15: Rechenregeln**
  - Festlegungen (Fynn, 29.09.2026): **Plätze sind feste Kästen 1–N** (wie das analoge Board 2025: alle Plätze sichtbar, ein frei gewordener Platz bleibt leer, andere Karten behalten ihre Nummer). Ablegen auf einem belegten Platz wird mit Hinweis abgelehnt (auch wenn alle voll sind), es wird nie getauscht. Der Admin kann N während der Auswahl mit Plus/Minus ändern; Minus nimmt nur den letzten Platz weg und nur, wenn er leer ist, sonst Hinweis. Rückgängig wird mit Hinweis abgelehnt, wenn die Karte seitdem bewegt wurde (auch innerhalb von „Auch gern“) oder ihr alter Platz belegt bzw. weggefallen ist. „Auch gern“ bleibt eine lückenlose Liste (in Phase 16 entfallen, der Pool ist jetzt die geordnete Liste). Kurzbewertung nur aus abgegebenem Feedback, eine Nachkommastelle. Menü: Admin-Seiten kommen unter einen Eintrag „Einstellungen“, Terminplanung vermutlich nicht; was genau hinein soll, zu Beginn von Phase 16 besprechen.
  - Ergebnis: Reine Funktionen (`src/lib/board-rules.ts`) für:
    - die Kurzbewertung (gewichtet, auf eine Skala umgerechnet)
    - die Zusammensetzungsleiste
    - die Board-Verschiebung mit Neunummerierung der Positionen
    - Rückgängig
  - Prüfung:
    - Vitest-Fälle laufen grün, darunter Kriterien mit unterschiedlicher Skala, fehlendes Feedback ergibt „–“, und ein Rückgängig stellt genau den vorherigen Zustand her.
  - Belegt am 29.09.2026: Vitest `src/lib/board-rules.test.ts` 30/30 (unterschiedliche Skalen, Entwürfe zählen nicht, ohne abgegebenes Feedback „–“, Rückgängig stellt für neun Arten von Verschiebung genau den vorherigen Zustand her, Rückgängig vom Rückgängig, belegter/weggefallener Platz, seitdem bewegt, Plus/Minus, Leiste nach Jahrgang und Ressort inkl. „weiß noch nicht“ und „keine Angabe“). `npm test` 593 grün, 3 übersprungen. Lint und `tsc` fehlerfrei.

- [x] **Phase 16: Draft Board für einen Nutzer**
  - Festlegungen (Fynn, 30.09.2026, nach Vorschau „Board-Vorschau Phase 16“, https://claude.ai/artifact/YRqWciby77eYtgjAq6tUnq, Fassung 3): **drei Zonen** Pool, Plätze, „Nicht aufnehmen“ („Auch gern“ entfällt). Der Pool ist geordnet und wird vom Team sortiert; was am Ende dort liegt, ist in dieser Reihenfolge die Nachrückerliste. Anfangs nach Kurzbewertung sortiert. Karten auf einem Platz bekommen **ein oder zwei Ressorts** vom Team (nicht vorbelegt, Wunsch bleibt sichtbar), die Leiste zählt die Zuteilung. **Kurznamen** der Ressorts (Runde 2026: Termine, Anwälte, Curriculum, ÖA, SBS) unter „Runde“. Board erst nach „Auswahlrunde starten“ sichtbar. Menü: Übersicht · Verfügbarkeit · Gespräche · Bewerbungen · Terminplanung · Board · Einstellungen (Runde, Team, Erfassen); am Handy Board unter „Mehr“ zuerst. Handy: Zonen untereinander, Antippen → „Verschieben“. Plus/Minus der Plätze erscheint im Verlauf; auch die Ressort-Zuteilung (in Phase 17 rückgängig machbar). **Keine eigene Beamer-Seite**, sondern „Beamer-Modus“: dasselbe Board mit allen Informationen, ohne Menü, größer (diskutiert wird am Beamer). Farben: Plätze leicht grün, „Nicht aufnehmen“ hellrot, Ressorts mit Farbpunkt. Minimalistisch.
  - Ergebnis:
    - Migration `20261003100000_board.sql`: Zonen `pool`/`seat`/`reject`, `departments.short_name`, `board_departments`, Verlaufsarten, `private.board_active`, Schreiben nur über `move_card`, `set_seats` (Admin), `set_board_departments`; `save_round` mit Kurzname und Schutz gegen weniger Plätze als belegt
    - `src/lib/board-rules.ts` umgebaut (geordneter Pool, Ressorte, Leiste nach Zuteilung), `src/lib/board.ts`
    - `/board` (`board-view.tsx`): Drag & Drop per Maus und Tastatur (dnd kit `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0), Details rechts, Ressort-Auswahl, „Verschieben“ ohne Ziehen, Handy-Blatt, Beamer-Modus
    - `/einstellungen`, neues Menü, Feld „Kurzname fürs Board“
  - Prüfung: Mit 15 Testbewerbern auf N = 10 Plätzen:
    - Karten lassen sich in alle Zonen verschieben.
    - Die Reihenfolge im Pool bleibt nach dem Neuladen erhalten.
    - Die Leiste stimmt mit einer Handzählung überein.
  - Belegt am 30.09.2026, Abnahme durch Fynn lokal gegen `-test` („Funktioniert alles“; Beamer-Modus bleibt in der Größe): Vitest `board-rules.test.ts` 34/34, `board.test.ts` 11/11 gegen `-test` (15 Bewerber, 10 Plätze: alle Plätze belegt, belegter Platz abgelehnt, „Nicht aufnehmen“, Pool-Reihenfolge nach Neuladen, veraltete Pool-Ansicht abgelehnt, 1–2 Ressorts, drittes abgelehnt, Leiste = Handzählung, Plus/Minus nur Admin und nur leerer letzter Platz, Verlauf 14/3/2 Einträge, keine Direktschreibrechte, deaktiviert und ohne Anmeldung abgelehnt, vor Start und nach Einfrieren abgelehnt), `rls.test.ts` angepasst. `npm test` 610 grün, 2 an der Supabase-Ratenbegrenzung gescheitert und einzeln grün (`login.test.ts` 4/4, `team.test.ts` 10/10, `round.test.ts` 13/13). Build, Lint, `tsc` fehlerfrei. Im Browser (Chrome, per DevTools-Protokoll, lokal gegen `-test` mit 15 Probe-Bewerbern): Mausziehen Pool → Platz 4, „Nicht aufnehmen“ → Pool oben, Platz → „Nicht aufnehmen“ gespeichert; Platz auf belegten Platz abgelehnt mit Hinweis; nach Neuladen gleiche Pool-Reihenfolge (Abfrage `board_positions`). Fotos 1280 px hell/dunkel, Details, Ressort-Auswahl, 1920 px Beamer-Modus, 390 px hell/dunkel mit Blatt. Migration auf `-test` am 30.09.2026 laut Fynn „success“ (plus Korrektur `move_card`), per Abfrage bestätigt; **auf `-prod` noch nicht ausgeführt**. Probe-Daten danach entfernt (Abfrage: 0 Bewerbungen, 0 Feedback, 0 Board-Einträge, Auswahlrunde leer).

- [ ] **Phase 17: Board live, Verlauf, Einfrieren und Ergebnis; Abnahme D**
  - Ergebnis:
    - Realtime
    - Einblendung „wer, was, wohin“
    - Verlauf mit Rückgängig
    - Einfrieren durch einen Admin
    - `/board/ergebnis` mit den Gruppen Zusage (mit zugeteiltem Ressort), Nachrücker (Pool in Reihenfolge) und Absage („Nicht aufnehmen“) samt Adressen
  - Prüfung:
    - Zwei Browser und ein Handy verschieben gleichzeitig, und alle zeigen innerhalb von etwa 1 Sekunde denselben Stand (Bildschirmaufnahme).
    - Rückgängig funktioniert.
    - Nach dem Einfrieren wird jede Verschiebung abgewiesen, auch ein direkter Datenbankzugriff, belegt durch einen Test.
    - Die Ergebnisliste stimmt.
    - Abnahme D: eine Probe-Auswahlsitzung mit 3 Personen auf `-test`.
    - **Prüfpunkt klären:** Realtime mit mehreren Geräten.
  - **Stand 01.10.2026 (in Arbeit, Branch `phase-17`, nicht auf `main`, nicht live):** Festlegungen Fynn: Vorschau „Board live – Phase 17“ (https://claude.ai/artifact/7FKQN71pMSgj7AMNCDdt1R), **Einblendung Variante A** (dunkle Zeile unten wie die bisherigen Hinweise, 4 s, „Anna: Lena Hoffmann → Platz 4“), Verlauf als Leiste rechts bzw. Blatt am Handy mit „Rückgängig“ je Zeile oder Grund, warum nicht; Einfrieren als Textknopf mit Rückfrage, danach Zeile mit „Ergebnis ansehen“; **Admins können das Einfrieren aufheben**; **Rückgängig dürfen alle Mitglieder** (Plätze +/− nur Admins); **Ergebnis sehen alle Mitglieder**; je Gruppe „Adressen kopieren“ (Semikolon, für BCC in Outlook). Gebaut: Migration `20261004100000_board_live.sql` (`board_events` in der Realtime-Publikation, Spalte `seq` für die Reihenfolge, Arten `freeze`/`unfreeze`, `undo_board_event`, `freeze_board`, `unfreeze_board`), `undoBlock` in `board-rules.ts`, Verlauf/Ergebnis/Rückgängig/Einfrieren in `board.ts`, Realtime (`postgres_changes` auf `board_events`, danach Neuladen, `accept` verwirft ältere Antworten) und Verlauf in `board-view.tsx`, `/board/ergebnis`, `src/lib/supabase/client.ts`. Belegt: `board-rules.test.ts` 40/40, `tsc` und Lint fehlerfrei. **Offen:** Migration auf `-test` (noch nicht ausgeführt), dann `board.test.ts` (neue Fälle: Rückgängig, Einfrieren/Aufheben, Ablehnung nach dem Einfrieren auch direkt, Ergebnisliste), `rls.test.ts`, Build, Realtime mit zwei Browsern, Fotos, Abnahme D; erst danach Merge auf `main` und Migration auf `-prod`.

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

- [ ] **Phase G: Versandweg Microsoft Graph**, sobald die IT zugestimmt hat, jederzeit einschiebbar. **Ruht:** Die IT hat Graph am 30.09.2026 abgelehnt (siehe Vorbereitung). Code bleibt.
  - Ergebnis: `sendMail()` mit dem Weg `graph`, umschaltbar pro Runde.
  - Prüfung:
    - Eine Testmail mit Kalendereinladung kommt mit dem Absender Funktionspostfach an.
    - Nach dem Zurückschalten läuft wieder alles über Gmail.
    - **Prüfpunkt klären:** Ablauf der IT-Freigabe.
