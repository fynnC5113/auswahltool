# PRD: Auswahltool für das Orga-Team der Law Clinic

Stand: 28.09.2026. Grundlage: `Konzept.md` und das Interview vom selben Tag. Wo die PRD vom Konzept abweicht, gilt die PRD.

## 1. Zweck

Die Auswahlrunde für neue Mitglieder des Orga-Teams läuft bisher über fünf Werkzeuge: Mail, SharePoint, Crab Fit, Excel und Whiteboard. Das Tool bündelt sie an einem Ort: Bewerbung, Terminplanung, Feedback und die gemeinsame Auswahl im Draft Board.

Rahmen 2025: rund 30 Bewerbungen und 10 Plätze. Die Gespräche finden meist in Raum 0.23 statt.

Es ist Fynns Nebenprojekt. Es wird gebaut, fertiggestellt und dem Team erst dann vorgestellt. Eine vorherige Freigabe durch Bian oder das Team ist keine Voraussetzung für den Bau.

## 2. Nutzer

| Rolle | Wer | Problem, das das Tool löst |
| :---- | :---- | :---- |
| Mitglied | Orga-Team | Muss Unterlagen, Termine und Feedback bisher in mehreren Werkzeugen zusammensuchen. Die Verfügbarkeit trägt es heute in Crab Fit ein, das Feedback in Excel. |
| Admin | Ein oder mehrere Mitglieder | Stimmt heute Team, Paare und Bewerber gleichzeitig per Mail ab, lädt PDFs hoch, verschickt Freigabelinks und tippt das Ergebnis ab. |
| Bewerber | Studierende aller Jahrgänge | Bewirbt sich per Mail und wartet auf einen Terminvorschlag. Künftig bucht er seinen Termin selbst. |

## 3. Umfang

Alle drei Ausbaustufen aus dem Konzept werden vollständig gebaut:

1. **Team-Tool:** Runde, Team, Bewerbungen, Terminplanung, Feedback, Draft Board, Löschung
2. **Bewerberportal:** öffentliches Formular, persönlicher Link, Selbstbuchung, automatische Mails
3. **Gemeinsames Board:** Alle verschieben live, mit Verlauf und Rückgängig.

Die Reihenfolge der Stufen bleibt die Bau-Reihenfolge.

## 4. Anforderungen (Muss)

### 4.1 Zugang und Rollen

- Es gibt keine Passwörter und keine Registrierung.
- **Team:** Ein Admin trägt die Mailadressen ein. Zum Anmelden gibt man die eigene Adresse ein und bekommt einen Login-Link. Danach bleibt man auf dem Gerät einige Wochen angemeldet.
- Wer das Team verlässt, wird deaktiviert und nicht gelöscht. Deaktivierte können sich nicht mehr anmelden.
- Es gibt keinen gemeinsamen Team-Link.
- **Mitglied:** sieht alle Bewerbungen und alle Feedbacks, mit Ausnahme der Sichtsperre (4.5). Trägt seine Verfügbarkeit und sein eigenes Feedback ein, markiert Befangenheit.
- **Admin:** kann alles, was ein Mitglied kann, und zusätzlich:
  - Teammitglieder anlegen und deaktivieren
  - andere Mitglieder zu Admins machen
  - die Runde konfigurieren
  - Slots bestätigen
  - Bewerbungen erfassen
  - die Sichtsperre aufheben
  - das Board einfrieren
  - die Löschung verwalten
- Es sind **mehrere Admins** möglich.
- **Bewerber:** bekommt nach dem Einreichen einen persönlichen, nicht erratbaren Link und hat kein Konto.

### 4.2 Runde anlegen (Admin)

Pro Jahr gibt es eine Runde. Konfigurierbar sind:

- Bewerbungsfragen (Freitext, beliebig viele)
- Ressorts mit je einem Satz Beschreibung
- Feedback-Kriterien, jeweils mit **Gewicht** für die Kurzbewertung
- Zahl der Plätze N
- Gesprächsdauer und Puffer, getrennt einstellbar
- Beginn und Ende der Bewerbungsphase
- Umbuchungsfrist für Bewerber, zum Beispiel bis 24 Stunden vor dem Termin
- Zeitraum, in dem Gespräche stattfinden
- Löschdatum

### 4.3 Bewerbung

- **Öffentliches Formular im Tool** mit Datenschutzhinweis. Das Formular ist nur zwischen Beginn und Ende der Bewerbungsphase geöffnet.
- **Pflichtangaben:**
  - Name
  - Mail
  - Jahrgang
  - Lebenslauf (PDF)
  - Antworten auf alle Bewerbungsfragen als Textfelder
  - Wunsch-Ressort
- **Wunsch-Ressort:** Mehrfachauswahl. Neben jedem Ressort steht ein Satz Beschreibung, dazu gibt es die Option „weiß ich noch nicht“.
- Nach dem Absenden erscheint eine Bestätigungsseite, und es geht automatisch eine Eingangsbestätigung mit dem persönlichen Link raus.
- **Persönliche Seite** (über den Link):
  - Die Bewerbung ansehen.
  - Antworten und Lebenslauf bis zum Ende der Bewerbungsphase ändern.
  - Einen Slot buchen und bis zur Umbuchungsfrist umbuchen.
  - Die Bewerbung zurückziehen.
- **Ersatzweg:** Ein Admin kann eine Bewerbung einzeln von Hand erfassen und die PDFs hochladen, etwa wenn jemand per Mail schickt oder nach dem Ende der Bewerbungsphase. Auch dann bekommt der Bewerber einen persönlichen Link.
- Die Verfügbarkeit der Bewerber wird nicht abgefragt.

### 4.4 Terminplanung

**Team-intern:**
- Mitglieder, die Gespräche führen wollen, tragen ihre Verfügbarkeit in einem Zeitraster ein, ähnlich wie in Crab Fit.
- Dazu können sie eine **optionale Obergrenze** an Gesprächen angeben.
- **Orte:** Standard ist 0.23. Weitere Orte legt der Admin an. An einem Ort findet immer nur ein Gespräch gleichzeitig statt.
- **Sperrzeiten:** Der Admin trägt ein, wann ein Ort belegt ist, etwa 0.23 wegen Beratungen. In Sperrzeiten entstehen keine Slots.
- **Slot = Gespräch + Puffer.** Der Puffer dient der Nachbesprechung und dem Feedback.
- **Slotvorschläge:** Aus den Verfügbarkeiten schlägt das Tool Slots mit Zeit, Ort und zwei Gesprächsführern vor. Dabei gilt:
  - Die Paare bildet das Tool frei.
  - Die Gespräche werden möglichst gleichmäßig verteilt.
  - Obergrenzen werden eingehalten.
- Der Admin kann jeden Vorschlag ändern und bestätigt ihn.
- **Kapazitätsanzeige:** zeigt, wie viele Slots im Verhältnis zur Zahl der Bewerbungen noch fehlen.

**Bewerber:**
- Bewerber buchen über ihre persönliche Seite einen freien, bestätigten Slot. Ein Slot kann nur einmal gebucht werden.
- **Befangenheit:** Ein Gesprächsführer, der sich bei einem Bewerber als befangen markiert hat, darf dessen Slot nicht führen. Das Tool bietet diesem Bewerber solche Slots nicht an. Markiert sich ein Gesprächsführer erst nach der Buchung als befangen, sehen die Admins einen Hinweis und teilen um.
- Passt kein Slot, zeigt die Buchungsseite nur den Hinweis, sich per Mail an die Law Clinic zu wenden. Der Admin kann dann einen Slot anlegen oder einen Bewerber einem Slot zuordnen.

**Unterlagen:** Die Gesprächsführer sehen die Unterlagen ihrer Bewerber direkt im Tool. Freigabelinks entfallen.

### 4.5 Feedback

- Wenige feste Kriterien, jeweils mit Skala und Freitext, dazu ein freies Gesamtfeld. Welche Kriterien es sind und wie sie gewichtet werden, entscheidet das Team.
- Das Feedback lässt sich am Handy in wenigen Minuten ausfüllen.
- **Sichtsperre im Paar:** Den Eintrag des anderen Gesprächsführers sieht man erst, wenn man den eigenen abgegeben hat. Alle übrigen Mitglieder sehen alles.
  - Die Admins sehen, wo Feedback fehlt, und können die Sperre im Einzelfall aufheben.
  - Mit dem Start der Auswahlrunde fällt die Sperre für alle automatisch weg.
- Das Feedback bleibt nach der Abgabe **frei änderbar**, bis das Board eingefroren ist.
- **Befangenheit:** Jedes Mitglied kann sich bei einem Bewerber als befangen markieren. Die Markierung ist für alle sichtbar. Wer befangen ist, sieht die Unterlagen weiterhin.

### 4.6 Auswahlrunde: Draft Board

- **Vier Zonen:**
  - **Pool**
  - **Plätze 1 bis N:** gleichwertig, die Nummer bedeutet keine Rangfolge
  - **„Auch gern“:** geordnete Nachrückerliste, der Erste rückt zuerst nach
  - **„Nicht aufnehmen“**
- Die Karten werden per Drag & Drop verschoben.
- **Karte:** Name, Jahrgang, Wunsch-Ressort und Kurzbewertung. Die Kurzbewertung ist der **gewichtete Durchschnitt** der Skalenwerte beider Gesprächsführer mit den Gewichten aus der Runde.
- Wer nicht zum Gespräch erschienen ist, hat einen sichtbaren Status auf der Karte.
- **Detailansicht per Klick:** oben das Feedback beider Gesprächsführer, darunter die Antworten und der Lebenslauf.
- **Zusammensetzungsleiste:** zeigt live, wie sich die vergebenen Plätze nach Jahrgang und Wunsch-Ressort verteilen.
- **Live:** Alle Mitglieder öffnen das Board auf ihrem eigenen Gerät und sehen jede Änderung sofort.
- **Gemeinsames Verschieben:** Alle Mitglieder können verschieben.
  - Jede Verschiebung wird kurz für alle angezeigt: wer, welche Karte, wohin.
  - Jede Verschiebung landet in einem Verlauf und lässt sich rückgängig machen.
- **Einfrieren:** Ein Admin friert das Board ein. Erst dann gilt es als Ergebnis, und danach sind keine Verschiebungen mehr möglich.
- **Ergebnis:** Nach dem Einfrieren zeigt das Tool drei Gruppen mit Namen und Mailadressen:
  - Zusage (die Plätze)
  - Nachrücker („Auch gern“ in Reihenfolge)
  - Absage (alle übrigen)

  Die Mails zu Zu- und Absage schreibt das Team außerhalb des Tools in Outlook.

### 4.7 Mails und Kalender

- **Automatische Mails:**
  - Login-Link an Teammitglieder
  - Eingangsbestätigung mit persönlichem Link an den Bewerber
  - Buchungsbestätigung an den Bewerber mit Kalendereinladung
  - Kalendereinladung an beide Gesprächsführer, sobald ihr Slot gebucht ist
  - Beim Umbuchen oder Zurückziehen: Absage des alten Termins an alle Beteiligten, beim Umbuchen dazu die neue Einladung
  - Erinnerung an alle Admins kurz vor dem Löschdatum
- **Absender:** Die Absenderadresse ist eine Einstellung.
  - Ziel ist das Funktionspostfach der Law Clinic (Uni-Microsoft-365). Dafür wird die Uni-IT **einmal** und nur zum Mailversand gefragt. Daraus darf kein großes Freigabeverfahren werden.
  - Ersatzlösung, falls die IT ablehnt oder nicht zügig antwortet: ein eigenes, kostenloses Gmail-Konto nur für das Tool, mit dem Anzeigenamen „Law Clinic Orga-Team“. Antworten gehen an das Funktionspostfach.
- **Kosten:** Der Betrieb kostet nichts. Es gibt keine eigene Domain und keine kostenpflichtigen Tarife.
- **Keine** Mails zu Zu- und Absagen aus dem Tool.

### 4.8 Löschung

- **Rückzug:** Zieht ein Bewerber zurück, werden seine Bewerbung, Dateien und das Feedback sofort endgültig gelöscht. Ein gebuchter Slot wird wieder frei.
- **Nicht erschienen:** Der Admin setzt einen Status. Die Daten bleiben bis zum Löschdatum.
- **Runde:** Zum Löschdatum werden alle Bewerbungen, Dateien, Feedbacks, Verfügbarkeiten, Slots und der Board-Stand der Runde endgültig gelöscht. Kurz vorher erinnert das Tool alle Admins per Mail.
- **Übrig bleiben** nur anonyme Zahlen: Zahl der Bewerbungen, Gespräche und Aufnahmen sowie die Verteilung nach Jahrgang und Wunsch-Ressort.
- Die Teamliste (Mitglieder und Admins) ist nicht Teil der Runde und bleibt bestehen.

## 5. Nice-to-have

Keine festgelegt. Neue Ideen werden erst nach der Fertigstellung der drei Stufen erwogen.

## 6. Ausdrücklich nicht gebaut

- Automatische Vorauswahl, Ranking oder KI-Auswertung von Bewerbungen. Es entscheiden nur Menschen.
- Online-Gespräche, Videolinks, Anbindung an Teams oder Zoom
- Export von Bewerbungen oder Feedback (Excel, PDF oder Ähnliches)
- Abgleich mit dem Beratungskalender, Outlook oder anderen fremden Kalendern. Kalendereinladungen per Mail (4.7) sind davon ausgenommen.
- Zu- und Absagemails aus dem Tool
- Import aus MS Forms
- Mehrsprachigkeit. Die Oberfläche ist nur auf Deutsch.
- Konten oder Passwörter für Bewerber

## 7. Unangenehme Fälle

| Fall | Verhalten |
| :---- | :---- |
| Pflichtfeld leer | Das Feld wird markiert, und das Formular lässt sich nicht absenden. |
| Datei ist keine PDF oder größer als 10 MB | Sie wird abgelehnt, mit einer verständlichen Meldung. |
| Zweite Bewerbung mit derselben Mailadresse in derselben Runde | Es entsteht kein Doppeleintrag. Der Hinweis lautet, dass bereits eine Bewerbung existiert und der persönliche Link erneut an diese Adresse geschickt wurde. |
| Formular nach dem Ende der Bewerbungsphase aufgerufen | Das Formular ist geschlossen, mit Hinweis auf die Mailadresse der Law Clinic. |
| Persönlicher Link ungültig oder Bewerbung gelöscht | Neutrale Fehlerseite. Sie verrät nicht, ob es die Bewerbung gab. |
| Zwei Bewerber buchen gleichzeitig denselben Slot | Nur einer bekommt ihn, der andere sieht, dass der Slot vergeben ist. |
| Umbuchung nach der Frist | Nicht möglich, mit Hinweis auf die Mailadresse der Law Clinic. |
| Kein passender Slot | Hinweis auf die Mailadresse der Law Clinic (4.4). |
| Gesprächsführer gibt kein Feedback ab | Die Admins sehen das und können die Sichtsperre aufheben (4.5). |
| Gesprächsführer wird nach der Einteilung deaktiviert oder befangen | Hinweis an die Admins, der Slot muss neu besetzt werden. |
| Login-Link für eine unbekannte oder deaktivierte Adresse angefordert | Dieselbe neutrale Meldung wie bei Erfolg, aber es geht keine Mail raus. |
| Login-Link abgelaufen oder schon benutzt | Hinweis, dass ein neuer Link angefordert werden muss. |
| Zwei Personen bewegen gleichzeitig dieselbe Karte | Die letzte Bewegung zählt. Beide sehen die Anzeige, und die Bewegung steht im Verlauf und lässt sich rückgängig machen. |
| Verschieben nach dem Einfrieren | Nicht möglich. |

## 8. Bildschirme und Nutzerfluss

### Team

```
[Login]
  Mailadresse eingeben → „Link ist unterwegs" → Klick in der Mail → [Übersicht]

[Übersicht]
  Stand der Runde: Phase, Zahl der Bewerbungen, fehlende Slots, fehlendes Feedback,
  Hinweise für Admins (Befangenheit nach Einteilung, deaktivierte Gesprächsführer)
  ├─ [Bewerbungen]            Liste mit Suche und Filter (Jahrgang, Ressort, Status)
  │     └─ [Bewerbung]        Antworten, Lebenslauf, Feedback (mit Sichtsperre),
  │                           „Ich bin befangen", [Admin] Status / Sperre aufheben
  ├─ [Meine Verfügbarkeit]    Zeitraster zum Anklicken, Obergrenze
  ├─ [Meine Gespräche]        (Handy) eigene Termine mit Ort und Partner
  │     └─ [Feedback]         Kriterien: Skala + Freitext, Gesamtfeld, Abgeben
  ├─ [Terminplanung] Admin    Orte, Sperrzeiten, Slotvorschläge bestätigen/ändern,
  │                           Kapazitätsanzeige, Bewerber einem Slot zuordnen
  ├─ [Draft Board]            vier Zonen, Zusammensetzungsleiste, Verlauf
  │     ├─ [Detail]           Seitenleiste: Feedback oben, Antworten + CV darunter
  │     └─ [Ergebnis]         nach Einfrieren: Zusage / Nachrücker / Absage
  └─ [Einstellungen] Admin
        ├─ Runde              Fragen, Ressorts, Kriterien + Gewichte, Plätze,
        │                     Dauer, Puffer, Fristen, Löschdatum, Absender
        ├─ Team               Mitglieder anlegen, deaktivieren, zu Admins machen
        ├─ Bewerbung erfassen Ersatzweg von Hand
        └─ Löschung           Löschdatum, anonyme Zahlen früherer Runden
```

### Bewerber

```
[Formular]  Datenschutzhinweis, Angaben, Fragen, Ressorts, PDF-Upload
   └─ Absenden → [Bestätigung] ··· Mail mit persönlichem Link ···>

[Persönliche Seite]  (über den Link)
   ├─ Bewerbung ansehen / ändern        bis Ende der Bewerbungsphase
   ├─ Termin buchen / umbuchen          freie Slots, bis Umbuchungsfrist
   │     └─ Buchung → Bestätigung ··· Mail mit Kalendereinladung ···>
   └─ Bewerbung zurückziehen            mit Rückfrage, danach sofort gelöscht
```

## 9. Datenschutz (Anforderungen an den Bau)

- Hosting und Speicherung in der EU, beim Anbieter mit Auftragsverarbeitungsvertrag
- Datenschutzhinweis im Formular: Zweck, wer die Daten sieht, wann sie gelöscht werden
- Jeder Lebenslauf liegt genau einmal im Tool. Es gibt keine Freigabelinks und keine Exporte.
- Endgültige Löschung einzelner Bewerbungen und ganzer Runden, einschließlich der Dateien
- Persönliche Links und Login-Links sind nicht erratbar.
- Die Uni-IT wird nur für den Mailversand gefragt, die Daten liegen nicht bei der Uni.

## 10. Offen

- Ende der Bewerbungsphase und Termin der Auswahlrunde 2026
- Zahl der Plätze 2026
- Feedback-Kriterien und ihre Gewichtung (Entscheidung des Teams)
- Gesprächsdauer und Puffer 2026
- Text des Datenschutzhinweises
- Antwort der Uni-IT zum Versand über das Funktionspostfach
