# Architektur von KickTime 2028

## Überblick

```
          ┌──────────────────────── src/tournament ────────────────────────┐
          │ nations · venues · schedule (51 Spiele) · bracket · tv · draw │  statische Fakten
          └───────────────────────────────┬────────────────────────────────┘
                                          │
 Live-Daten (OpenLigaDB / Edge Function) ─┤
 Admin-Korrekturen (match_overrides) ─────┤      src/domain/resolve.ts
 Vorschau-Modus (src/demo) ───────────────┤ ──▶  resolveTournament(): reine Funktion
                                          │      → MatchView[] + Tabellen + beste Dritte
                                          ▼
                          src/store/match-store.ts (Zustand, berechnet)
                                          │
        Einstellungen (app-store, localStorage) ──▶ domain/recommend.ts → Feed
                                          ▼
                                 React-Seiten & Komponenten
```

Kernprinzip: **Der Turnierzustand wird immer komplett aus seinen Eingaben berechnet.**
Eingaben sind der Spielplan, die Auslosung, die Ergebnisse (Live, Admin oder Demo), Patches
(offizielle Uhrzeiten, Teams aus Live-Daten) und die aktuelle Zeit. Teams in K.-o.-Spielen
werden nie „hineingeschrieben“, sondern aus Tabellen und Siegern abgeleitet. Doppelte oder
verwaiste Spiele sind dadurch ausgeschlossen. Die Logik ist rein funktional und mit Tests
abgedeckt.

## Module

### `src/tournament/` – Turnierdaten

| Datei         | Inhalt                                                                            |
| ------------- | --------------------------------------------------------------------------------- |
| `types.ts`    | turnierunabhängige Typen (`Nation`, `Venue`, `FixtureDef`, Slot-Referenzen)       |
| `config.ts`   | Name, Daten, Gruppen, Runden-Labels, Meilensteine, Live-Quelle, URLs              |
| `nations.ts`  | 54 Nationen, Namens-Mapping für Live-Daten (`nationFromName`)                     |
| `venues.ts`   | 9 Stadien inkl. Zeitzone, Anreise, Klima                                          |
| `schedule.ts` | 51 Spiele mit Slots (`A1`, `1A`, `3ADEF`, `W37`), Datum, Ort, vorläufiger Uhrzeit |
| `bracket.ts`  | Drittplatzierten-Tabelle, Bracket-Layout                                          |
| `tv.ts`       | Sender-Logik (ARD/ZDF/MagentaTV)                                                  |
| `draw.ts`     | **Pflege-Datei**: Qualifikation, Auslosung, bestätigte Uhrzeiten                  |

### `src/domain/` – Logik (getestet)

| Datei              | Aufgabe                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| `time.ts`          | Zeitzonen, Zeitfenster pro Wochentag, „wie viele Minuten sind schaubar?“               |
| `standings.ts`     | Gruppentabellen nach UEFA-Reglement (direkter Vergleich), Rangliste der Dritten        |
| `resolve.ts`       | Gesamtzustand: Status aus Daten/Uhr, Slots → Teams, Sieger inkl. Elfmeter              |
| `recommend.ts`     | Relevanz-Score mit Gründen, Feed (Für dich / Später / Bonus / Rückblick)               |
| `status.ts`        | Team-Status (Quali läuft, dabei, raus in Runde X, Europameister)                       |
| `live.ts`          | OpenLigaDB → normalisiert, Zuordnung zu Spielnummern (Paarung → Tag+Stadion → Uhrzeit) |
| `predictions.ts`   | Tipp-Wertung 4/3/2                                                                     |
| `alarms.ts`        | Erinnerungen (an / bewusst aus / automatisch für Favoriten)                            |
| `labels.ts`        | Anzeigenamen für Platzhalter („Sieger Gruppe A“, „Dritter A/D/E/F“)                    |
| `pills.ts`         | Filter-Pillen der Startseite (passt perfekt / außerhalb / Ergebnisse)                  |
| `rounds.ts`        | Tipp-Abschnitte wie bei Kicktipp (drei Spieltage, dann K.-o.-Runden)                   |
| `compare.ts`       | Tipp-Vergleich und Rundentabelle (`buildBoard`, auch vorläufig mit Live-Stand)         |
| `table-spoiler.ts` | Spoilerschutz für Tabellen, K.-o.-Baum und Teams (gemerkter Ergebnisstand)             |

### Zustand (`src/store/`)

- **`app-store.ts`** (persistiert unter `kicktime-2028`): Teams, Zeitfenster, Zeitzone,
  Spoilerschutz und Aufgedecktes, Theme, Erinnerungen, Tipps, Vorschau-Modus.
- **`match-store.ts`** (flüchtig): Live-Ergebnisse, Patches, Admin-Korrekturen, Uhr und der
  daraus berechnete `tournament`-Zustand. Die Live-Quelle gibt vor; eine Admin-Korrektur
  gilt nur, solange die Quelle noch den beim Speichern gemerkten Stand meldet
  (`source_sig`/`resultSignature`, `mergeResults`).
- **`ui-store.ts`**: offene Detail-Sheets (Spiel/Team), einmal global gerendert.

### Motor (`src/hooks/useEngine.ts`)

Wird einmal im Root eingehängt und kümmert sich um:

- Uhr-Tick alle 10 Sekunden (Live-Status, Countdown)
- Abgleich des Vorschau-Modus
- Theme (inkl. Systemwechsel)
- Live-Daten adaptiv: um laufende Spiele jede Minute, im Turnierzeitraum alle 15 Minuten, sonst
  einmal beim Start
- Erinnerungen: lokal bei geöffneter App und serverseitig über `kt_sync_alarms`

### Seiten (`src/routes/`)

`/` Für dich · `/spielplan` · `/turnier` (Gruppen · K.-o.-Baum · Teams) · `/tipps` (eigene
Tipps und Tipprunden) · `/runde/$code` (Einladungslink) · `/einstellungen` · `/sitemap.xml` · `/version.json` (Update-Hinweis). Die App rendert erst nach dem Laden des lokalen Zustands
(kein Hydration-Flackern). Die Dark/Light-Klasse wird per Inline-Script vor dem ersten Paint
gesetzt.

## Backend (Supabase)

```
Browser ──invoke──▶ live-scores ──▶ OpenLigaDB
   │                   │  live_cache (60 s / 5 min), match_results (beendet = unveränderlich)
   ├──fetch──▶ ESPN (direkt, nur an EM-Spieltagen; ESPN sperrt Rechenzentren)
   ├──select──▶ match_overrides, app_config (öffentlich lesbar)
   ├──rpc──▶ kt_* (SECURITY DEFINER): Push-Abo, Erinnerungen, Statistik-Ping, Feedback,
   │          Tipprunden (kt_tip_*), Sperren/Anträge, Quellen-Meldungen (kt_report_source)
   └──invoke──▶ admin (PIN oder Face-ID-Freigabe; Sperre nach Fehlversuchen je IP und
                insgesamt) ──▶ Korrekturen, Tipprunden, Anträge, Statistik, Team-Protokoll
pg_cron (jede Minute) ──▶ send-push-reminders ──▶ Web Push (VAPID) ──▶ public/sw.js
                           ├─ Spiel- und Tipp-Erinnerungen, Tipprunden-Nachrichten
                           ├─ Wächter rund um jedes Spiel ──▶ Team-Geräte (kt_alerts)
                           └─ täglich: Aufräumen alter Abos (kt_push_cleanup)
```

Alle Tabellen sind per RLS gesperrt; die App schreibt nur über die geprüften `kt_*`-Funktionen.
Die Team-App (`KicktimeApps/Kicktime2028-Admin`) nutzt dieselben Edge Functions. Die IP aus
`admin` dient nur der PIN-Sperre (`admin_attempts`), die Statistik speichert keine IP.

Ohne Supabase holt der Browser die Daten direkt bei OpenLigaDB (CORS erlaubt). Erinnerungen
gibt es dann nur bei geöffneter App, als Alternative bietet sich der Kalender-Export an.

## Qualitätssicherung

- `bun run check`: TypeScript, ESLint (inkl. Prettier) und Unit-Tests (Okt. 2026: 156)
- Browser-Tests der wichtigsten Abläufe (`e2e/`, Playwright, Handy + Desktop, Server
  nachgestellt), auch bei jedem Push auf GitHub (`.github/workflows/pruefungen.yml`)
- Edge Functions: `deno check` (Deno 2)
- Visuelle Prüfung mit Playwright (mobil 390 px und Desktop 1440 px, Dark und Light) über alle
  Seiten und Demo-Szenarien
