# Tech-Design: Auswahltool Orga-Team

Stand: 28.09.2026. Grundlage: `PRD.md`. Vorgabe: Der Betrieb kostet **0 €**.

Was hier über Funktionen der Bibliotheken steht, ist am 28.09.2026 über Context7 in der aktuellen Doku nachgelesen. Was nicht nachgelesen ist, steht unter 9. „Prüfpunkte“.

## 1. Stack

| Baustein | Aufgabe | Begründung | Was er später erschwert |
| :---- | :---- | :---- | :---- |
| **Next.js** (App Router, TypeScript) | Die ganze App: Seiten, Formulare, Serverlogik | Läuft direkt auf dem vorhandenen Vercel-Konto. Oberfläche und Server liegen in einem Projekt. | Das Framework ändert sich schnell, bei Updates müssen Teile nachgezogen werden. |
| **Vercel** (kostenloser Tarif) | Hosting | Das Konto ist vorhanden. Die Funktionsregion wird auf Frankfurt (`fra1`) gestellt, Standard wäre Washington (`iad1`). | US-Anbieter. Im kostenlosen Tarif laufen Zeitplan-Jobs höchstens einmal täglich, und der Zeitpunkt schwankt innerhalb einer Stunde. |
| **Supabase** (kostenloser Tarif, Region Frankfurt) | Postgres-Datenbank, Login-Links (Auth), PDF-Ablage (Storage), Live-Aktualisierung (Realtime) | Alles aus einer Hand. Es gibt einen DPA (Auftragsverarbeitungsvertrag). Laut Doku muss man eine **konkrete EU-Region** wählen, weil die Gruppe „Europa“ auch London und Zürich umfasst. | Der kostenlose Tarif **pausiert nach 7 Tagen ohne Aktivität** und hat keine herunterladbaren Backups. Man ist an Supabase gebunden: Die Datenbank ist mitnehmbar, Login, Ablage und Realtime nicht. |
| **Microsoft Graph** (`/users/{postfach}/sendMail`) | Versandweg A: Mails aus dem Funktionspostfach der Law Clinic | Echter Absender Law Clinic, kostenlos. Die IT kann die Berechtigung `Mail.Send` per RBAC for Applications in Exchange Online auf **genau dieses eine Postfach** beschränken (ersetzt laut Microsoft-Doku die Application Access Policy). | Braucht die einmalige Freigabe der Uni-IT (App-Registrierung plus Rollenzuweisung in Exchange). |
| **Nodemailer** mit Gmail | Versandweg B (Ersatz): eigenes, kostenloses Gmail-Konto des Tools, Anmeldung per App-Passwort | Kostenlos und sofort nutzbar. Kann Kalendereinladungen direkt mitsenden (`icalEvent`, `method: REQUEST`). | Der Absender ist sichtbar eine Gmail-Adresse. Google (US) verarbeitet die Mails, darin stehen Namen, Termine und Links, aber keine Lebensläufe. Das Gmail-Konto braucht Zwei-Faktor-Anmeldung. |
| **ics** | Kalendereinladungen erzeugen | Unterstützt Organisator, Teilnehmer, feste `uid` und `sequence`. Damit lassen sich Einladung, Änderung und Absage desselben Termins abbilden. | – |
| **dnd kit** | Drag & Drop im Board | Hat eine eigene Anleitung für Karten zwischen mehreren Spalten, funktioniert per Maus, Touch und Tastatur. | – |
| **Tailwind CSS** | Aussehen, Handy-Ansicht | Wird bei Next.js standardmäßig mit eingerichtet. Die Handy-Ansicht wird zuerst gebaut. | Die Klassennamen im Code sind anfangs ungewohnt zu lesen. |
| **Vitest** | Automatische Tests | Schnell, versteht TypeScript ohne Zusatzaufwand. | – |

**Umgebungen:** zwei kostenlose Supabase-Projekte, der kostenlose Tarif erlaubt zwei.
- `auswahltool-prod`: echte Runde
- `auswahltool-test`: Entwicklung und automatische Tests

Es wird keine lokale Datenbank und kein Docker gebraucht.

**Geheimnisse** (Schlüssel und Passwörter) liegen nur in den Umgebungsvariablen von Vercel und in einer lokalen `.env.local`, nie im Git-Repository:
- Supabase-Schlüssel (öffentlich und Service-Role)
- Graph-Zugangsdaten
- Gmail-App-Passwort
- Geheimnis für den Zeitplan-Job

## 2. Architektur

```
Browser (Team, Bewerber)
   │
   ▼
Next.js auf Vercel (fra1)
   ├─ Team-Seiten ──────► Supabase mit Nutzer-Session  → Zeilenregeln (RLS) greifen
   ├─ Bewerber-Seiten ──► Server prüft Link-Token, dann Supabase mit Service-Role,
   │                      streng nur auf diesen einen Bewerber beschränkt
   ├─ Mail-Baustein ────► Graph ODER Gmail (Einstellung pro Runde)
   └─ Zeitplan-Job ─────► täglich: Löschung, Erinnerung
   
Supabase (Frankfurt)
   ├─ Postgres (Daten + Zeilenregeln)
   ├─ Auth (Teamlogin)
   ├─ Storage (privater Bucket „cv“, nur PDF, max. 10 MB)
   └─ Realtime (Board, Übersicht)
```

**Grundsätze:**
- **Team:** Alle Lese- und Schreibzugriffe laufen mit der Session des Mitglieds. Row Level Security (RLS) in Postgres entscheidet, was es sehen und ändern darf. Ein Fehler in der Oberfläche kann so keine Daten offenlegen.
- **Bewerber:** Sie haben kein Konto. Jede Bewerberseite prüft zuerst das Token aus dem Link auf dem Server. Erst danach wird mit dem Service-Role-Schlüssel gelesen oder geschrieben, und jede Abfrage ist fest auf `applicant_id` dieses Bewerbers begrenzt. Der Service-Role-Schlüssel verlässt nie den Server.
- **Öffentliches Formular:** Es schreibt ebenfalls nur über den Server, nach der Prüfung von Frist, Pflichtfeldern, Dateityp und Dateigröße.

## 3. Login (Team)

1. Das Mitglied gibt seine Mailadresse ein.
2. Der Server prüft, ob die Adresse als aktives Mitglied in `team_members` steht.
   - Nein: Es erscheint dieselbe neutrale Meldung wie bei Erfolg, aber es geht keine Mail raus.
   - Ja: Der Server erzeugt mit `supabase.auth.admin.generateLink({ type: 'magiclink', … })` einen Login-Link, ohne dass Supabase selbst eine Mail verschickt.
3. Der Mail-Baustein verschickt den Link über Graph oder Gmail.
4. Laut Supabase-Doku sind Login-Links standardmäßig 24 Stunden gültig und nur einmal verwendbar. Die Session wird über Refresh-Tokens verlängert, und die laufen nicht ab. Damit bleibt man angemeldet.
5. Deaktivierung: Jede Anfrage prüft `team_members.active`, auch in den RLS-Regeln. Wer deaktiviert ist, sieht sofort nichts mehr, selbst wenn seine Session noch gültig ist.

**Hinweis aus der Supabase-Doku:** Mailprogramme von Unternehmen öffnen Links manchmal automatisch zur Prüfung und verbrauchen damit einen Einmal-Link. Deshalb führt der Link in der Mail zuerst auf eine eigene Seite mit einem Knopf „Anmelden“. Erst dieser Knopf löst den eigentlichen Login aus.

## 4. Datenmodell

Alle Zeitpunkte werden als `timestamptz` gespeichert und in `Europe/Berlin` angezeigt. `id` ist immer eine UUID.

### 4.1 Dauerhaft (bleibt nach Löschung einer Runde)

**team_members**
| Feld | Typ | Bedeutung |
| :---- | :---- | :---- |
| id | uuid | = Supabase-Auth-Nutzer-ID (wird beim Anlegen erzeugt) |
| email | text, eindeutig | Login-Adresse |
| name | text | Anzeigename |
| role | `admin` \| `member` | Rolle |
| active | bool | deaktiviert = false |

**round_stats**: anonyme Zahlen, die beim Löschen einer Runde geschrieben werden
| Feld | Typ |
| :---- | :---- |
| year | int |
| applications, interviews, admitted | int |
| by_cohort | jsonb, z. B. `{"2025": 12, "2024": 9}` |
| by_department | jsonb |

### 4.2 Pro Runde (wird mit der Runde gelöscht)

Alle Tabellen hängen über `round_id` an `rounds`, mit `on delete cascade`. Löscht man die Runde, verschwindet alles darunter.

**rounds**
| Feld | Typ | Bedeutung |
| :---- | :---- | :---- |
| year, title | int, text | |
| seats | int | Zahl der Plätze N |
| interview_minutes, buffer_minutes | int | Gespräch und Puffer |
| application_opens_at, application_closes_at | timestamptz | Bewerbungsphase |
| interviews_from, interviews_until | date | Zeitraum für Gespräche |
| rebook_hours_before | int | Umbuchungsfrist |
| deletion_date | date | Löschdatum |
| mail_transport | `graph` \| `gmail` | Versandweg |
| reply_to | text | Antwortadresse (Funktionspostfach) |
| privacy_notice | text | Datenschutzhinweis |
| selection_started_at | timestamptz, null | ab hier fällt die Sichtsperre für alle |
| board_frozen_at, board_frozen_by | timestamptz, uuid, null | Einfrieren |
| deletion_reminder_sent_at | timestamptz, null | |

**questions**: `round_id`, `position`, `text`
**departments**: `round_id`, `position`, `name`, `description`
**criteria**: `round_id`, `position`, `name`, `description`, `weight` (numeric > 0), `scale_min`, `scale_max`

**applicants**
| Feld | Typ | Bedeutung |
| :---- | :---- | :---- |
| round_id | uuid | |
| name, email, cohort | text | email pro Runde eindeutig (ohne Groß- und Kleinschreibung) |
| department_unsure | bool | „weiß ich noch nicht“ |
| cv_path | text | Pfad im Bucket `cv` |
| token_hash | text | SHA-256 des persönlichen Tokens. Das Token selbst wird nie gespeichert. |
| source | `form` \| `admin` | Formular oder Erfassung durch Admin |
| status | `active` \| `no_show` | Rückzug = sofortige Löschung, deshalb kein eigener Status |
| sight_lock_lifted | bool | Sichtsperre vom Admin aufgehoben |
| privacy_confirmed_at | timestamptz | Datenschutzhinweis im Formular bestätigt; bei Erfassung durch Admin leer |
| created_at, updated_at | timestamptz | |

**answers**: `applicant_id`, `question_id`, `text`
**applicant_departments**: `applicant_id`, `department_id`

**locations**: `round_id`, `name`, `is_default`
**blocked_times**: `location_id`, `starts_at`, `ends_at`, `note`

**availabilities**: `round_id`, `member_id`, `starts_at`, `ends_at`. Ein Eintrag pro angeklicktem Rasterfeld. Das Raster hat 15 Minuten.
**member_round_settings**: `round_id`, `member_id`, `max_interviews` (null = unbegrenzt)

**slots**
| Feld | Typ | Bedeutung |
| :---- | :---- | :---- |
| round_id, location_id | uuid | |
| starts_at | timestamptz | Beginn des Gesprächs |
| interview_ends_at, ends_at | timestamptz | Ende des Gesprächs, Ende des Puffers |
| interviewer_a, interviewer_b | uuid, null | Paar. Leer, bis gebucht wird oder ein Admin es festlegt; beide gesetzt oder beide leer, ein gebuchter Slot hat immer ein Paar. |
| status | `proposed` \| `confirmed` | Seit 29.09.2026 legt das Tool jeden Slot als `confirmed` an (keine Bestätigung, Fynn); `proposed` wird nicht mehr benutzt. |
| applicant_id | uuid, null, **eindeutig** | Buchung. Die Eindeutigkeit verhindert Doppelbuchungen. |
| booked_at | timestamptz, null | |
| ics_sequence | int | Zähler für Kalender-Updates |

Zusatzregel in der Datenbank: Zwei Slots am selben Ort dürfen sich zeitlich nicht überschneiden, auch nicht mit dem Puffer. Das sichert eine Postgres-Ausschlussregel (Exclusion Constraint) ab.

**conflicts** (Befangenheit): `applicant_id`, `member_id`, `created_at`

**feedback**
| Feld | Typ |
| :---- | :---- |
| applicant_id, member_id | uuid, zusammen eindeutig |
| overall_text | text |
| submitted_at | timestamptz, null (null = Entwurf) |
| updated_at | timestamptz |

**feedback_scores**: `feedback_id`, `criterion_id`, `score` (int innerhalb der Skala), `text`

**board_positions**
| Feld | Typ | Bedeutung |
| :---- | :---- | :---- |
| round_id, applicant_id | uuid | ein Eintrag pro Bewerber |
| zone | `pool` \| `seat` \| `also` \| `reject` | |
| position | int | nur bei `seat` (1…N) und `also` (Reihenfolge) von Bedeutung |
| updated_at, updated_by | | |

**board_events**: der Verlauf, nur Anfügen
| Feld | Typ |
| :---- | :---- |
| round_id, applicant_id, actor_id | uuid |
| from_zone, from_position, to_zone, to_position | |
| created_at | timestamptz |
| undoes_event_id | uuid, null. Rückgängig ist ein neuer Eintrag, der den alten umkehrt. |

### 4.3 Berechnet, nicht gespeichert

- **Kurzbewertung** = Σ(score × weight) / Σ(weight) über alle abgegebenen Werte beider Gesprächsführer. Damit sie über Kriterien mit unterschiedlicher Skala vergleichbar ist, wird jede Skala vorher auf 0 bis 1 umgerechnet. Angezeigt wird auf der Skala des ersten Kriteriums. Fehlt Feedback ganz, steht „–“ auf der Karte.
- **Kapazität**: Bewerbungen ohne Termin (= Bewerbungen minus gebuchte Slots), freie Slots und davon derzeit buchbare (Paar festgelegt oder noch eines zu finden).
- **Zusammensetzungsleiste** = Anzahl in der Zone `seat`, gruppiert nach `cohort` und nach Wunsch-Ressort.

## 5. Zugriffsregeln (RLS)

Hilfsfunktionen in der Datenbank:
- `is_member()`: angemeldet und `active`
- `is_admin()`: zusätzlich `role = 'admin'`

| Daten | Lesen | Schreiben |
| :---- | :---- | :---- |
| team_members | Mitglied | Admin |
| rounds und Konfiguration | Mitglied | Admin |
| applicants, answers, CV | Mitglied | Admin (Erfassung, Status); Bewerber nur über den Server |
| availabilities, member_round_settings | Mitglied | nur die eigenen Einträge |
| locations, blocked_times, slots | Mitglied | Admin. Die Buchung macht der Server. |
| conflicts | Mitglied | nur die eigene Markierung |
| feedback, feedback_scores | Mitglied, **außer bei der Sichtsperre** (unten) | nur das eigene, nur als Gesprächsführer des gebuchten Termins ab Gesprächsbeginn, und nur solange das Board nicht eingefroren ist. Seit Phase 14 **nur über `public.save_feedback`** (security definer, prüft das alles gegen `auth.uid()`; beim Abgeben und danach: jede Skala, jede Begründung, Gesamteindruck). Direkte Schreibrechte sind entzogen. `public.feedback_progress(round_id)` liefert Mitgliedern nur „abgegeben/Entwurf“ ohne Inhalt für „Feedback fehlt“. |
| board_positions, board_events | Mitglied | Mitglied, solange nicht eingefroren. Einfrieren darf nur der Admin. |
| round_stats | Mitglied | nur der Zeitplan-Job |

**Sichtsperre**, als Regel für das Lesen von `feedback`: Ein Mitglied darf den Feedback-Eintrag eines anderen zu Bewerber X lesen, wenn eine der folgenden Bedingungen zutrifft:
- Es ist selbst **nicht** Gesprächsführer im Slot von X.
- Oder es hat sein eigenes Feedback zu X abgegeben (`submitted_at` ist gesetzt).
- Oder `applicants.sight_lock_lifted` ist gesetzt.
- Oder `rounds.selection_started_at` ist erreicht.

Entwürfe (`submitted_at` ist null) sieht nur der Verfasser.

**Storage:** Der Bucket `cv` ist privat und auf `application/pdf` und 10 MB begrenzt (laut Doku per `allowedMimeTypes` und `fileSizeLimit` am Bucket). Mitglieder bekommen kurzlebige signierte Links, laut Doku `createSignedUrl` mit Ablaufzeit.

## 6. Abläufe

### 6.1 Bewerbung
1. Das Formular prüft, ob die Bewerbungsphase läuft, ob alle Pflichtfelder ausgefüllt sind und ob der Lebenslauf eine PDF bis 10 MB ist.
2. Gibt es die Mailadresse in dieser Runde schon, wird nichts angelegt. Stattdessen bekommt die Adresse eine Mail mit einem **neuen** Link, und das alte Token wird ersetzt.
3. Sonst legt der Server den Bewerber an, speichert die PDF, erzeugt ein zufälliges Token (mindestens 32 Byte), speichert nur dessen Hash und verschickt die Eingangsbestätigung mit dem Link.
4. Zurückziehen löscht in dieser Reihenfolge:
   - PDF aus dem Storage
   - Bewerber (Kaskade: Antworten, Feedback, Befangenheiten, Board-Position, Board-Verlauf)
   - Die Buchung des Slots wird freigegeben.
   - Kalender-Absage an die Gesprächsführer

### 6.2 Slots und Paare (Kernlogik, als reine Funktionen testbar)
Festgelegt von Fynn am 29.09.2026, `src/lib/slot-offers.ts`. Die ursprüngliche Fassung (Slots mit festem Paar und Bestätigung, `proposeSlots` in `src/lib/slot-proposals.ts`, Phase 10) wird nicht mehr aufgerufen.

**`offerTimes`: alle möglichen Slots.** Pro Ort (Standardort zuerst) ab der frühesten Startzeit lückenlos hintereinander (Gespräch + Puffer), wo der Ort frei ist (keine Sperrzeit, kein anderer Slot) und mindestens zwei aktive Mitglieder für die Gesprächszeit verfügbar sind und bis Pufferende in keinem Slot mit Paar sitzen. Ein weiterer Ort zur selben Zeit nur, wenn für jeden überlappenden Slot ohne Paar zwei weitere Leute da sind. Obergrenzen zählen hier nicht (nur 0 = nimmt keine Gespräche). Der Admin klickt „Alle möglichen Termine erzeugen“; vorhandene Slots bleiben, ein erneuter Klick ergänzt. Die Slots sind sofort buchbar (`confirmed`, ohne Paar), auch während der Bewerbungsphase.

**`choosePair`: das Paar bei der Buchung.** Aus den aktiven Mitgliedern, die für die Gesprächszeit verfügbar sind, bis Pufferende in keinem Slot mit Paar sitzen, weniger gebuchte Gespräche als ihre Obergrenze haben und beim Bewerber nicht befangen sind: das Paar mit dem kleinsten Wert des stärker belasteten Partners, dann eines mit „bevorzugt“, dann die kleinste Summe. Belastung = gebuchte Gespräche; „bevorzugt“ zählt als unbelastet. Hat ein Admin das Paar festgelegt, gilt dieses.

Der Admin ändert oder löscht freie Slots und legt bei jedem Slot das Paar fest oder ändert es. Zeit und Ort gebuchter Slots bleiben fest: Der Admin trägt den Bewerber aus und woanders ein (Fynn, 29.09.2026). Eintragen, Austragen und ein Paarwechsel bei gebuchten Slots verschicken Kalendermails (6.4). Admins dürfen die Obergrenze überschreiten (Hinweis in der Liste), Bewerber nicht.

### 6.3 Buchung
- Angeboten werden freie Slots, schon während der Bewerbungsphase: mit festgelegtem Paar, in dem niemand bei diesem Bewerber befangen ist, oder ohne Paar, wenn `choosePair` (ohne die Befangenen) eines findet.
- Angeboten und buchbar sind nur Slots, deren Umbuchungsfrist (`starts_at − rebook_hours_before`) noch nicht vorbei ist (Fynn, 29.09.2026). Gibt es noch gar keine Slots, sieht der Bewerber „Die Gesprächstermine werden gerade geplant“; gibt es Slots, aber keinen passenden, den Hinweis auf die Mailadresse.
- Das Paar wählt der Server (`pairFor` in `src/lib/scheduling-rules.ts`: festgelegtes Paar, wenn aktiv, nicht befangen und unter der Obergrenze, sonst `choosePair`); der eigene bisherige Slot zählt dabei nicht. Gebucht wird über `public.book_slot(p_slot_id, p_applicant_id, p_interviewer_a, p_interviewer_b)` (Migration `20260930100000_booking.sql`, nur `service_role`): Unter derselben Sperre wie der Trigger `slots_no_overlap_per_person` prüft sie freien Slot, Paar (festgelegtes Paar bleibt), aktiv und nicht befangen, Obergrenze (gebuchte Gespräche ohne den eigenen Slot), Umbuchungsfrist des alten Slots (`rebook_closed`) und des neuen (`too_late`); dann gibt sie den alten Slot samt Paar frei und bucht den neuen, beide mit `ics_sequence + 1`. Weist sie das Paar ab (`person_overlap`, `over_limit`, `member_unavailable`, `pair_changed`), versucht der Server es bis zu dreimal mit neu geladenen Daten.
- Ist der Slot inzwischen vergeben, meldet die Eindeutigkeitsregel einen Fehler, und der Bewerber sieht „Dieser Termin ist gerade vergeben worden“.
- Umbuchen geht nur bis `starts_at − rebook_hours_before`. Dabei wird der alte Slot frei, der neue gebucht, und beide Seiten bekommen die passende Kalendermail.
- Rückzug: Der Slot wird vor dem Löschen frei (samt Paar), die Gesprächsführer bekommen eine Absage; danach leitet die Seite auf `/b/zurueckgezogen` weiter.
- „Bewerber ohne Termin zum Buchen auffordern“ (Admin, `/terminplanung`): Weil nur der Hash des Tokens gespeichert ist, bekommt jeder einen neuen Link, der alte gilt nicht mehr; schlägt die Mail fehl, wird der alte Hash wiederhergestellt.

### 6.4 Kalendermails
- Jeder Slot hat eine feste `uid`, zum Beispiel `slot-<id>@auswahltool`.
- Einladung: `METHOD:REQUEST`, `sequence` = `ics_sequence`.
- Änderung: `ics_sequence + 1`, erneut `REQUEST`.
- Absage: `METHOD:CANCEL`, `STATUS:CANCELLED`.
- Jeder Empfänger bekommt eine eigene Mail mit eigener Kalenderdatei, in der nur er als Teilnehmer steht (`RSVP=FALSE`); `ORGANIZER` ist die Absenderadresse. Zeiten in UTC, Ende = Ende des Gesprächs (ohne Puffer). Umsetzung ohne Paket: `src/lib/calendar.ts` (Text), `src/lib/calendar-mail.ts` (Empfänger, Versand; Fehler werden gezählt und gemeldet, die Buchung bleibt).
- Empfänger:
  - Buchung: Bewerber (mit Buchungsbestätigung) und beide Gesprächsführer
  - Umbuchung: Absage des alten und Einladung zum neuen Termin
  - Rückzug: Absage an die Gesprächsführer
  - Admin trägt ein: wie Buchung (Bestätigung ohne Link, weil das Tool den Link nicht kennt); trägt aus: Absage an alle drei; ändert das Paar eines gebuchten Slots: Absage an wer herausfällt, Einladung an das neue Paar

### 6.5 Mail-Baustein
Eine Funktion `sendMail({ to, subject, text, html, ics? })` mit zwei Umsetzungen:
- **gmail:** Nodemailer mit `service: 'gmail'`, App-Passwort, `icalEvent` für Einladungen (`text/calendar; method=…`, Dateiname `termin.ics`, keine weiteren Anhänge)
- **graph:** OAuth-Anmeldung als App (Client Credentials, Token etwa 1 Stunde gültig und bis kurz vor Ablauf wiederverwendet), dann `POST /users/{funktionspostfach}/sendMail` im **MIME-Format** (`Content-Type: text/plain`, Mail base64-kodiert, Antwort `202`). Die MIME-Nachricht baut Nodemailer (Stream-Transport), damit beide Wege dieselbe Mail mit Text- und HTML-Teil und später derselben Kalendereinladung verschicken.

Absender ist „Law Clinic Orga-Team“ mit der Gmail-Adresse bzw. dem Funktionspostfach, „Antwort an“ ist `rounds.reply_to` (Ersatz: `MAIL_REPLY_TO`). Umgebungsvariablen: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_REPLY_TO`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_MAILBOX`.

Freigabe durch die IT für **graph** (laut Microsoft-Doku, am 28.09.2026 nachgelesen):
1. App-Registrierung in Entra ID mit Client Secret. `Mail.Send` dort **nicht** per Admin-Consent freigeben, sonst gilt das Recht für alle Postfächer (Entra- und Exchange-Rechte addieren sich).
2. In Exchange Online (RBAC for Applications): `New-ServicePrincipal` als Verweis auf die App, eine Management Scope nur für das Funktionspostfach, `New-ManagementRoleAssignment -Role "Application Mail.Send" -CustomResourceScope …`. Prüfbar mit `Test-ServicePrincipalAuthorization`.

**Spamfilter der Uni (festgestellt 28.09.2026):** Testmails über **gmail** an @law-school.de landeten im Junk-Ordner (`SCL:5`, `CAT:PHISH`), obwohl SPF, DKIM und DMARC bestanden. Abhilfe bis **graph** läuft: Die IT trägt die Gmail-Adresse in die Tenant Allow/Block List ein. Solche Einträge heben laut Doku Spam und Phishing (nicht hochgradig) auf, laufen aber standardmäßig 45 Tage nach letzter Nutzung ab, also vor jeder Runde erneuern lassen.

Mails an Bewerber und Team enthalten keine Lebensläufe und keine Bewertungen, nur Namen, Termine und Links.

### 6.6 Board live
- Eine Verschiebung speichert in einem Schritt (Transaktion) die neue Position, gleicht die Positionen der betroffenen Zonen an und schreibt einen Eintrag in `board_events`.
- Alle offenen Boards hören über Supabase Realtime auf Änderungen. Laut Doku liefert Realtime nur Zeilen aus, die der Empfänger nach RLS lesen darf. Die Doku empfiehlt für mehr Leistung „Broadcast“ statt direkter Tabellenänderungen. Welche Variante es wird, entscheidet die Phase „Board“. Bei 20 Geräten reicht vermutlich beides, geprüft ist das nicht.
- Die letzte Bewegung gilt. Jede Bewegung wird kurz eingeblendet („Anna → Platz 3: Max M.“).
- Rückgängig macht die Bewegung eines Verlaufseintrags umgekehrt und schreibt dafür einen neuen Eintrag.
- Nach `board_frozen_at` lehnen die Datenbankregeln jede Verschiebung ab.

### 6.7 Zeitplan-Job (Vercel Cron, täglich)
- Aufruf einer geschützten Route mit einem geheimen Schlüssel.
- Liegt das Löschdatum einer Runde in 7 Tagen und ist noch keine Erinnerung verschickt: Erinnerung an alle Admins.
- Ist das Löschdatum erreicht:
  1. `round_stats` schreiben
  2. alle PDFs der Runde aus dem Storage löschen
  3. die Runde löschen (Kaskade)
  4. prüfen, ob noch Dateien unter dem Pfad der Runde liegen. Wenn ja, eine Fehlermail an die Admins.

## 7. Seitenstruktur (Routen)

```
/login                         Mail eingeben
/auth/confirm                  „Anmelden"-Knopf aus dem Login-Link
/                              Übersicht
/bewerbungen, /bewerbungen/[id]
/verfuegbarkeit
/gespraeche, /gespraeche/[slotId]/feedback
/terminplanung                 Admin
/board, /board/ergebnis
/einstellungen/runde | team | erfassen | loeschung    Admin

/bewerben                      öffentliches Formular
/b/[token]                     persönliche Seite des Bewerbers
/api/cron/daily                Zeitplan-Job
```

## 8. Tests

- **Vitest, reine Logik:**
  - Slotvorschläge (6.2)
  - Kurzbewertung (4.3)
  - Fristen (Bewerbungsphase, Umbuchung)
  - Token-Hash
  - Kalendertexte (6.4)
  - Board-Verschiebung und Rückgängig
- **Vitest gegen `auswahltool-test`, Zugriffsregeln:** Für jede Zeile in Abschnitt 5 mindestens ein Test „darf“ und ein Test „darf nicht“, als Mitglied, Admin, deaktiviertes Mitglied und ohne Anmeldung. Die Sichtsperre bekommt alle vier Bedingungen einzeln.
- **Durchlauf von Hand:** eine Testrunde mit erfundenen Bewerbern auf `auswahltool-test`, vom Formular bis zur Löschung. Eine Checkliste dafür steht in `PLAN.md`.

## 9. Prüfpunkte (nicht verifiziert)

- [ ] Bietet Vercel für den kostenlosen Tarif einen Auftragsverarbeitungsvertrag an? Relevant für das Gespräch mit Bian.
- [x] Wie hoch ist das tägliche Sendelimit des Gmail-Kontos? Erwartet werden rund 150 Mails pro Runde, verteilt über Wochen. **Geklärt 28.09.2026:** 500 Mails pro Tag, danach 1 bis 24 Stunden gesperrt (Google-Hilfe, support.google.com/mail/answer/22839). Reicht deutlich.
- [ ] Hält der tägliche Zeitplan-Job Supabase wach, sodass es während einer Runde nicht pausiert? Sonst muss das Projekt vor einer Runde einmal von Hand aufgeweckt werden.
- [ ] Genauer Ablauf der IT-Freigabe für Graph (App-Registrierung, `Mail.Send`, Beschränkung auf das Funktionspostfach). Das ist die Grundlage für die Anfrage an die IT. Stand 28.09.2026: Ablauf laut Doku in 6.5 beschrieben, von der IT noch nicht bestätigt.
- [ ] Laufen Realtime-Änderungen bei 20 gleichzeitigen Geräten im kostenlosen Tarif ohne Engpass?
