# Design: Auswahltool Orga-Team

Gilt für jede sichtbare Änderung. Grundlage ist die Vorschau vom 29.09.2026 (Artifact „Auswahltool Designrichtungen“, https://claude.ai/artifact/WTCpcZa6R7v6PVvGj1drjN), Richtung **A „Klar“ mit den Feldern und großen Zahlen aus B**, von Fynn gewählt.

Leitlinie: **ruhig, klar, aufgeräumt.** Apple-Einstellungen als Vorbild: gruppierte Listen auf grauem Grund, eine Systemschrift, wenige Schriftstufen, viel Luft. Hell und dunkel gleichwertig, das Gerät entscheidet. Ruhe entsteht aus festen Stufen und Abständen, nicht aus Dekoration.

## 1. Farben

Alle Farben sind benannte Werte in `src/app/globals.css` (je einmal hell, einmal dunkel). Im Code stehen nur diese Namen, nie `zinc-…`, `red-…` oder Hex-Werte, und kein `dark:` mehr: Die Werte wechseln selbst.

| Name | Rolle | Hell | Dunkel |
| :-- | :-- | :-- | :-- |
| `bg` | Seitengrund | `#f2f3f6` | `#0a0c10` |
| `surface` | Gruppen, Karten, Dialoge | `#ffffff` | `#16191f` |
| `field` | Eingabefelder, aktive Menüpunkte | `#eef0f4` | `#21252e` |
| `line` | Trennlinien, Rahmen | `#dde1e7` | `#2a2f39` |
| `fg` | Text | `#151a22` | `#eef1f5` |
| `muted` | Erklärtext, Feldnamen, Zeitangaben | `#5b6574` | `#98a2b1` |
| `accent` | Knöpfe, Links, Auswahl (Marineblau aus dem Logo) | `#374b65` | `#9db4d6` |
| `on-accent` | Text auf `accent` | `#ffffff` | `#0a0c10` |
| `accent-soft` | leichte Hervorhebung, Dateisymbol | `#e6ebf2` | `#1d2633` |
| `danger` | Fehler, Löschen, Zurückziehen (Weinrot aus dem Logo) | `#a21d29` | `#ff7a82` |
| `danger-soft` | Grund einer Fehlermeldung | `#f8e6e8` | `#2e1517` |
| `warn` | Hinweise für Admins, „nicht gespeichert“ | `#7a4f00` | `#f0c36b` |
| `warn-soft` | Grund eines Hinweises | `#fbf1dc` | `#2b2413` |
| `ok` | „Gebucht“, „Gespeichert“ | `#2f6b4f` | `#7fcfa6` |
| `ok-soft` | Grund einer Erfolgsmeldung | `#e3f1ea` | `#16271f` |
| `bar` | Menüleisten, Leiste unten (halb durchsichtig mit Unschärfe) | `rgba(246,247,250,.86)` | `rgba(18,21,27,.86)` |

Regeln:
- **Eine** Akzentfarbe. Marineblau heißt „hier kann ich etwas tun“.
- Weinrot nur für Fehler und endgültige Aktionen. Nie als Schmuck, nie für Überschriften. **Ausnahme Board** (Fynn, 30.09.2026): Die Zone „Nicht aufnehmen“ liegt auf `danger-soft`, die Plätze auf `ok-soft`, der Pool auf `field`.
- **Ressortfarben** (nur Board, Phase 16): `--c-dept-0` bis `--c-dept-7` in `globals.css` (hell und dunkel), nach der Reihenfolge der Ressorts in der Runde. Nur als Punkt von 8 px, immer mit dem Namen daneben, nie als Fläche.
- Status braucht immer auch Text oder Form, nie nur Farbe.

## 2. Schrift

Systemschrift, nichts wird geladen: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Auf iPhone und Mac ist das SF Pro.

**Genau fünf Stufen.** Keine Zwischengrößen.

| Stufe | Größe / Zeilenhöhe | Gewicht | Wofür |
| :-- | :-- | :-- | :-- |
| Titel | 30 / 34 px | 700 | eine Überschrift pro Seite (`h1`) |
| Abschnitt | 20 / 25 px | 600 | Abschnittsüberschrift (`h2`), gebuchter Termin, Phase der Runde |
| Text | 17 / 24 px | 400, betont 500 | Inhalt, Eingaben, Knöpfe, Listen |
| Erklärung | 15 / 22 px | 400, betont 500/600 | Erklärtext unter Überschriften, Feldnamen in Formularen, Links, Tageszeilen |
| Klein | 13 / 18 px | 400/500 | Feldnamen in Lese-Listen, Fehler unter Feldern, Zahlbeschriftung, Menü |

Ausnahme: die großen Zahlen der Übersicht (36 px, 600, `tabular-nums`) und die Beschriftung im Menü unten (11 px).

- Überschriften in normaler Schreibweise, nie in Großbuchstaben, nie gesperrt.
- Zahlen, die untereinander stehen (Uhrzeiten, Zähler): `tabular-nums`.
- Text läuft höchstens etwa 70 Zeichen breit.

## 3. Abstände und Maße

4-px-Raster. Erlaubte Abstände: 4, 8, 12, 16, 20, 24, 28, 36, 48 px.

| Was | Handy | ab 640 px (`sm`) |
| :-- | :-- | :-- |
| Seitenrand | 16 px | 24 px |
| Abstand zwischen Abschnitten | 28 px | 36 px |
| Überschrift → Inhalt eines Abschnitts | 8 px | 8 px |
| Innenabstand einer Gruppe | 16 px | 16 px |
| Abstand zwischen Feldern in einer Gruppe | 16 px | 16 px |
| Feldname → Feld | 6 px | 6 px |
| Seitenbreite öffentlich (`/bewerben`, `/b/…`, Login) | volle Breite | höchstens 680 px, mittig |
| Seitenbreite Team | volle Breite | höchstens 880 px, mittig (Board später breiter) |

Rundungen: Gruppe 14 px, Feld 10 px, Knopf 12 px, Kachel 10 px, Häkchen 6 px, Status-Chip 999 px. Sonst keine.

Tippflächen mindestens 44 px hoch. Knöpfe wachsen mit, wenn ihr Text zweizeilig wird. Schatten nur bei Dialogen und dem „Mehr“-Menü.

## 4. Bausteine

Alle Bausteine liegen zentral (`src/app/ui.ts` bzw. kleine Komponenten daneben). Seiten bauen keine eigenen Varianten.

- **Seitenkopf öffentlich:** Bildmarke der Law Clinic (22 px hoch, `public/law-clinic-mark.png`, ohne den schwarzen Schriftzug) mit „Law Clinic“ / „Orga-Team“ in Klein. Darunter der Titel und eine Erklärungszeile.
- **Seitenkopf Team:** Titel und Erklärungszeile. Das Menü steht außerhalb.
- **Abschnitt:** Überschrift (Abschnitt), optional eine Erklärungszeile, dann eine Gruppe.
- **Gruppe, Formular:** `surface`, 14 px Rundung, 16 px innen. Jedes Feld darin: Feldname (Erklärung, Farbe `fg`, 500), darunter das Feld als gefüllte Fläche (`field`, 10 px Rundung, 11 × 12 px innen, Text). Kein Rahmen um das einzelne Feld.
- **Gruppe, Liste:** `surface`, 14 px Rundung, Zeilen 11 × 16 px innen, feine Trennlinie (`line`, 1 px), die links 16 px eingerückt beginnt. Für Häkchen, Angaben zum Lesen, Hinweise, Bewerbungen, Termine.
- **Angabe zum Lesen:** Feldname (Klein, `muted`) über dem Wert (Text).
- **Knopf, Hauptaktion:** `accent`, Text `on-accent`, 50 px hoch, 12 px Rundung, 600. Am Handy volle Breite, ab 640 px so breit wie der Text. Höchstens einer pro Abschnitt.
- **Knopf, zweitrangig:** `surface` (auf `bg`) bzw. `field` (auf `surface`), Text `accent`, 46 px hoch.
- **Link / Textknopf:** `accent`, Erklärung, 500, ohne Unterstreichung.
- **Endgültige Aktion** (Löschen, Zurückziehen): zuerst als Textknopf in `danger`. Erst die Rückfrage hat einen gefüllten Knopf in `danger`.
- **Häkchen:** 22 px, 6 px Rundung; angehakt `accent` mit Haken in `on-accent`. Die ganze Zeile ist antippbar.
- **Auswahl-Kacheln** (Uhrzeiten, Tage): `surface` mit Rahmen `line` bzw. `field` in einer Gruppe, 44 px hoch, 10 px Rundung; gewählt `accent`. Am Handy 3 Spalten, ab 640 px 5.
- **Große Zahl:** Kachel `surface`, Zahl 36 px, Beschriftung Klein `muted`. Am Handy 2 Spalten (bei fünf Zahlen 3), ab 640 px alle in einer Reihe.
- **Status-Chip** (in Listen): Klein, 500, Pille, `field`-Grund. Ausnahmen: „nicht erschienen“ in `warn-soft`/`warn`, gebuchter Termin in `accent-soft`/`accent`.
- **Meldungen:**
  - Fehler unter einem Feld: Klein in `danger`, das Feld bekommt eine 1,5-px-Kontur in `danger`.
  - Fehler für die ganze Seite: Zeile in `danger-soft`/`danger`, 10 px Rundung, `role="alert"`.
  - Erfolg: Zeile mit Haken in `ok`, `role="status"`.
  - Admin-Hinweis: Listenzeile mit Punkt in `warn` davor.
- **Ausklappen** (Datenschutzhinweis): Zeile in `surface` mit Pfeil rechts, der sich beim Öffnen dreht.
- **Dialog:** `surface`, Schatten, Grund dahinter abgedunkelt. Am Handy ein Blatt von unten (oben 14 px gerundet), ab 1024 px mittig. Aktionen untereinander, ab 640 px nebeneinander, Hauptaktion zuerst.
- **Leiste unten** (Buchen, Verfügbarkeit speichern): `bar` mit Unschärfe, Trennlinie oben. Am Handy steht sie über dem Menü (`bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0`).
- **Menü Team:**
  - Unter 1024 px unten, `bar`, Symbol + Beschriftung (11 px), aktiv in `accent`.
  - Ab 1024 px oben: Bildmarke + „Orga-Team“, Einträge in Erklärung, aktiv mit `field`-Grund, rechts Name und „Abmelden“.
- **Board** (Phase 16, Vorschau „Board-Vorschau Phase 16“, Fassung 3): Laptop drei Spalten (Pool 280 px, Plätze, „Nicht aufnehmen“ 240 px), Seite bis 1600 px breit und so hoch wie das Fenster, jede Zone scrollt für sich. Karte: `surface`, Rundung Feld, feine Kontur; Name (Erklärung, 600), rechts Kurzbewertung (`muted`, `tabular-nums`), darunter Jahrgang · Wunsch (Klein, `muted`); auf einem Platz Nummer oben rechts, „Ressort wählen ▾“ bzw. die Ressorte mit Punkt unten links, Kurzbewertung unten rechts. Freier Platz: gestrichelte Kontur `line`, „frei“. Leiste oben als Textzeile (Klein, Zahlen `fg`). Details rechts als Leiste (440 px), am Handy ganzseitig. Handy: Zonen untereinander, Sprungknöpfe oben, Antippen öffnet das Blatt „Verschieben“. Beamer-Modus: ohne Menü, Namen Abschnitt, Rest Erklärung/Text, Plätze in drei Spalten. Hinweise nach einer Aktion als Zeile unten (Fehler `danger`).
- **Raster Verfügbarkeit:** Feld frei = `field`, gewählt = `accent`, in einer Sperrzeit schräg schraffiert (`line`) mit dem Grund in `muted`, bleibt antippbar. Volle Stunden mit Trennlinie `line`.
- **Leerer Zustand:** ein Satz, was fehlt, und die Aktion, die es ändert („Noch keine Termine. Alle möglichen Termine erzeugen“).
- **Fokus:** 2 px Kontur in `accent`, 2 px Abstand, bei allem, was man bedienen kann.

## 5. Muster

- **Formularseite:** Titel → Erklärung (Frist, „Alle Felder sind Pflicht“) → Abschnitte mit Formular-Gruppen → Hauptknopf am Ende. Fehler stehen am Feld, dazu oben eine Zeile „Bitte prüfe die markierten Felder“.
- **Lese- und Aktionsseite** (`/b/…`, `/bewerbungen/[id]`): Titel → Stand in einem Satz → Abschnitte. Endgültige Aktionen stehen immer zuletzt.
- **Listenseite** (`/bewerbungen`, `/terminplanung`): Titel → Filter/Suche (Felder in einer Formular-Gruppe) → Zähler („12 von 23“) → Liste. Ein Tipp auf eine Zeile öffnet die Einzelseite bzw. den Dialog.
- **Übersicht:** Titel → Phase → große Zahlen → Link → Hinweise.
- **Bestätigung** (nach Absenden, Rückzug): Titel, ein bis zwei Sätze, was jetzt passiert, keine weitere Aktion nötig.

## 6. Handy zuerst

- Alles wird für 375 px Breite gebaut, dann erweitert. Keine waagrechte Scrollleiste der Seite. Einzige Ausnahme sind die Tage im Verfügbarkeitsraster, sie scrollen in ihrer eigenen Zeile.
- Ab 640 px: Formulare bleiben eine Spalte mit höchstens 680 px. Kurze Felder dürfen nebeneinander stehen (Name | Mailadresse).
- Eingabefelder haben mindestens 16 px Schrift, sonst zoomt das iPhone hinein (Stufe „Text“ = 17 px erfüllt das).
- Feste Elemente unten beachten die Menüleiste und `env(safe-area-inset-bottom)`.

## 7. So ja / so nein

| So ja | So nein |
| :-- | :-- |
| eine der fünf Schriftstufen | `text-lg`, `text-xs` oder eigene Größen dazwischen |
| Farbnamen aus Abschnitt 1 (`bg-surface`, `text-muted`) | `zinc-600`, `red-700`, Hex-Werte, `dark:`-Klassen |
| Abschnitte mit 28 px Abstand, Gruppen mit 16 px innen | `mb-2`, `mt-3`, `mb-5` wild gemischt |
| ein Hauptknopf pro Abschnitt | zwei gefüllte Knöpfe nebeneinander |
| „Bewerbung zurückziehen“ als roter Textknopf, gefüllt erst in der Rückfrage | roter gefüllter Knopf direkt auf der Seite |
| Überschrift in normaler Schreibweise | GROSSBUCHSTABEN, gesperrte Etiketten über Überschriften |
| Status als Chip mit Text | nur ein farbiger Punkt ohne Text |
| Rahmen nur um Gruppen | Rahmen um jedes einzelne Feld und dazu um die Gruppe |
| Knopftext sagt, was passiert („Termin buchen“) | „OK“, „Absenden“, „Weiter →“ |
| Fehler sagt, was zu tun ist („Bitte beantworte diese Frage.“) | „Ungültige Eingabe“ |

## 8. Prüfen

Jede Seite nach einer Änderung als Bildschirmfoto in 390 px und 1280 px Breite, hell und dunkel. Neue Bausteine erst hier eintragen, dann bauen.
