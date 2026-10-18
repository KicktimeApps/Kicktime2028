# Von KickTime 2026 zu KickTime 2028

Dieser Bericht fasst zusammen, was beim Analysieren von KickTime 2026 aufgefallen ist und wie
die Version für die EURO 2028 aufgebaut wurde. Das Repository `kicktime2026` wurde dabei
**nicht verändert**. Es diente nur als Vorlage.

## Was gut war und geblieben ist

Die Grundidee bleibt unverändert: **Teams wählen, Zeitfenster festlegen, passende Spiele
bekommen.** Erhalten (und überarbeitet) wurden außerdem Spoilerschutz, Erinnerungen per Web
Push, Kalender-Export, Tipps, Tabellen, Turnierstatus, Detailansichten, Teilen-Bild,
Admin-Bereich mit PIN, Telemetrie, Feedback und die Feier zum Turniersieger. Auch der Tech-Stack
ist derselbe (React 19, TanStack Start, Tailwind 4, Zustand, Supabase, Cloudflare), damit das
Projekt weiter mit Lovable funktioniert.

## Befunde in KickTime 2026

### Optik („wirkt billig“)

- **Emoji-Flaggen**: Unter Windows erscheinen statt Flaggen nur Buchstaben („DE“), und auch
  sonst wirken sie klein und unruhig.
- **Emojis in Bedienelementen** (🟢 Perfect, 🟡 Nacht, 🔴 Verpasst, 🚀, ⏰) statt eines
  einheitlichen Icon-Systems.
- **Glow-Effekte funktionierten nicht**: Mehrere Schatten nutzten `hsl(var(--primary))`, obwohl
  die Farben als `oklch` definiert sind. Das ergibt ungültiges CSS, die Effekte fehlten
  stellenweise.
- **Logo** als unscharfes, KI-generiertes JPEG (unter der Endung `.png`). Die PWA-Icons waren
  dasselbe JPEG in falschen Größenangaben.
- Systemschrift ohne Charakter und uneinheitliche Abstände und Schriftgrößen (9–11 px an vielen
  Stellen).
- Zwangs-Splashscreen von 3 Sekunden bei jedem Start.
- Sechs Tabs in der unteren Navigation, dazu toter Code (WhatsNew, deaktivierter Gastro-Tab mit
  veralteten Daten).

### Logik und Fehler

- **Zeitzone wurde ignoriert**: Die gespeicherte Zeitzone kam nie zum Einsatz (Parameter `_tz`).
- **Wochenende = Freitag bis Sonntag**, und ein Spiel um 01:00 Uhr zählte zum neuen Kalendertag.
  Ein Spiel in der Nacht von Sonntag auf Montag galt damit als „Werktag“.
- **Elfmeterschießen**: Endete das Finale nach Elfmeterschießen, gab es keinen Weltmeister (keine
  Feier, kein Banner). K.-o.-Verlierer im Elfmeterschießen wurden nie als ausgeschieden markiert.
- **Erfundene Spielstände**: Ohne Live-Daten zeigte die App ab Anpfiff automatisch „0:0 live“.
- Spiele galten nach 115 Minuten als beendet, auch K.-o.-Spiele mit Verlängerung.
- **Spoilerschutz mit Lücken**: Live-Stände, Tabellen, K.-o.-Baum und die ausgegrauten Verlierer
  verrieten Ergebnisse.
- **Admin-Korrekturen**: Die Edge Function verglich die IDs der Korrekturen mit OpenLigaDB-IDs,
  der Client mit eigenen IDs. Der serverseitige Abgleich griff deshalb nie.
- **Admin-PIN ohne Schutz vor Durchprobieren** (6 Ziffern = 1 Mio. Versuche).
- **Ohne `.env` stürzte die App ab** (Supabase-Client mit leerer URL).
- Der Browser schrieb direkt in Tabellen (Push-Abos, Alarme, Pings).
- „Top-Spiele“ waren fest auf Deutschland verdrahtet. Der Countdown zeigte Kürzel („GER vs. MEX“).
- Das Zuordnen der Live-Daten zu K.-o.-Spielen lief über eine Reihe von Notlösungen
  (±6 h-Fenster, Index-Fallback). In der Historie hatte das bereits doppelte Spiele verursacht.
- Feedback-Popup erschien ungefragt bei jedem 8. Start.

## Was in KickTime 2028 neu ist

### Turnierdaten EM 2028

- Offizieller UEFA-Spielplan: **51 Spiele, 9 Stadien, 8 Städte**, alle Paarungs-Slots,
  Achtelfinale bis Finale.
- **54 Nationen** der Qualifikation mit deutschen Namen, SVG-Flaggen und EM-Titeln.
- **Drittplatzierten-Regel** (15 Kombinationen) für das Achtelfinale.
- **TV-Rechte 2028**: ARD/ZDF zeigen 34 Spiele frei, MagentaTV alle 51, davon 17 exklusiv. Wo
  die Zuteilung noch offen ist, steht das ehrlich dabei.
- Noch Unbekanntes (Teams, Uhrzeiten, Sender) ist sauber als Platzhalter bzw. „vorläufig“
  gekennzeichnet. Nachgetragen wird es in einer einzigen Pflege-Datei (siehe
  [PFLEGE.md](PFLEGE.md)).

### Neue Logik (mit 62 Tests)

- **Zeitfenster pro Wochentag**, Fenster über Mitternacht gehören zum Vorabend. Dazu gibt es
  „teilweise schaubar“ (z. B. nur die 2. Halbzeit).
- **Empfehlungen mit Begründung** und Punktwert, neue Rubrik **„Bonus“** für sehenswerte Spiele
  ohne eigene Teams, dazu **Vormerken** einzelner Spiele.
- **UEFA-Tabellenregeln**: Erst zählt der direkte Vergleich, auch bei Dreier-Gleichstand, danach
  die Tordifferenz.
- **K.-o.-Baum füllt sich selbst**: Gruppensieger, beste Dritte und Sieger inklusive
  Elfmeterschießen.
- **Live-Daten-Abgleich über Spieltag + Stadion**. Das funktioniert auch ohne bekannte Teams und
  übernimmt offizielle Anstoßzeiten automatisch. Vertauschte Heim/Gast-Reihenfolge wird erkannt.
- Ohne Daten erfindet die App **keine** Spielstände mehr.

### Neues Design

- Design-System „Flutlicht“: Nachtblau, Flutlicht-Grün, Gold für Favoriten und Titel, Rot nur für
  LIVE. Dazu Dark, Light, System und fünf Akzentfarben.
- Schriften lokal eingebunden (keine Google-Server, DSGVO-freundlich): Inter + Barlow Condensed
  (Anzeigetafel-Optik).
- **SVG-Flaggen** auf allen Systemen, neues Vektor-Logo und neue PWA-Icons (inkl. maskable).
- Fünf statt sechs Tabs: _Für dich · Spielplan · Turnier · Tipps · Profil_. Auf dem Desktop gibt
  es eine Seitenleiste und mehrspaltige Layouts.
- Einheitliche Spielkarte, Detail-Sheets für Spiel und Team, K.-o.-Baum als echter Baum,
  Tipp-Eingabe direkt in der Liste.

### Neue Funktionen

- **Vorschau-Modus** mit fünf Szenarien (nach der Auslosung, Gruppenphase live, Achtelfinale,
  Finaltag, nach dem Finale). Erfundene Daten, deutlich als DEMO markiert.
- **Alle eigenen Spiele auf einmal in den Kalender**. Termine werden aktualisiert, wenn sich
  Zeiten ändern (stabile IDs).
- Zeitzone wählbar (für EM-Reisen oder Fans im Ausland). Ortszeit des Stadions im Detail.
- Fahrplan bis zum Turnier (Quali-Auslosung, Play-offs, Endrunden-Auslosung …) auf der
  Startseite.
- Spielort-Infos: Kapazität, Anreise (ÖPNV/Flughafen), typisches Wetter.
- Feedback nur noch auf Wunsch in den Einstellungen, mit optionalem Text.

### Backend und Sicherheit

- Läuft **komplett ohne Backend** (OpenLigaDB direkt aus dem Browser), Supabase ist optional.
- Komplette **SQL-Migration** mit RLS. Der Browser schreibt nur noch über abgesicherte Funktionen.
- **Admin-PIN mit Sperre** nach 5 Fehlversuchen pro IP bzw. 30 insgesamt (je 15 Minuten).
- Beendete Ergebnisse werden serverseitig **unveränderlich** gespeichert.
- Erinnerungen gehen erneut raus, wenn sich die Anstoßzeit ändert. Der Cron-Aufruf ist per
  Secret geschützt.
- Supabase-SDK wird erst bei Bedarf geladen (kleinerer Start).

### Geändert, bitte beachten

- **Tipp-Wertung** jetzt 4/3/2 (Volltreffer/Tordifferenz/Tendenz) statt 3/2/1.
- Neue Speicherschlüssel (`kicktime-2028`): Nutzer starten mit frischem Onboarding.
- Der Cloudflare-Worker heißt jetzt `kicktime-2028` (`wrangler.jsonc`).
- Der Impressums-Link zeigt weiterhin auf `kicktime2026.de` (über `VITE_LEGAL_URL` änderbar).
- Public-Viewing-/Gastro-Seite und WhatsNew wurden entfernt (deaktiviert bzw. veraltet).
