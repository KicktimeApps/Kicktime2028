# ⚽ KickTime 2028

**Der persönliche Planer für die UEFA EURO 2028** in England, Schottland, Wales und Irland
(9. Juni – 9. Juli 2028).

Du sagst KickTime zwei Dinge: **wem du die Daumen drückst** und **wann du Zeit hast**. KickTime
zeigt dir dann, welche der 51 Spiele in deinen Alltag passen, erinnert dich rechtzeitig und hält
Ergebnisse geheim, bis du sie sehen willst.

> Nachfolger von [KickTime 2026](https://github.com/phantom-35/kicktime2026) (WM 2026).
> Was sich geändert hat: [docs/AENDERUNGEN.md](docs/AENDERUNGEN.md).

## Funktionen

- **Für dich**: Startseite, die sich der Turnierphase anpasst – vor der Auslosung Countdown,
  deine Teams und die nächsten Termine; im Turnier _Jetzt live_, _Dein nächstes Spiel_ und
  darunter wie bei KickTime 2026 drei Pillen für die Spiele deiner Teams: _Perfekt_ (passt in
  deine Zeit) · _Außerhalb_ (nicht in deiner Zeit) · _Ergebnisse_.
- **Einstellungen** als Übersicht mit Unterseiten: Teams, Zeit, Erinnerungen (inkl.
  Test-Benachrichtigung), Darstellung, Vorschau-Modus, Feedback.
- **Öffnungsanimation** beim ersten Start pro Sitzung (reines CSS, läuft schon vor dem Laden).
- **Zeitfenster pro Wochentag**, auch über Mitternacht. Zusätzlich gibt es die Einstufung „teilweise schaubar“,
  wenn z. B. nur die 2. Halbzeit in deine Zeit fällt.
- **Spielplan** mit Suche, Filtern (Meine Spiele, Passt in meine Zeit, Gruppe/Runde) und Sprung
  zum heutigen Tag.
- **Turnier**: Live-Tabellen nach UEFA-Regeln (direkter Vergleich), Rangliste der Gruppendritten,
  symmetrischer K.-o.-Baum und alle 54 Nationen mit Status.
- **Tipps** nach Spieltagen (1.–3. Spieltag, Achtelfinale … Finale), Ergebnis direkt eintippen,
  alle Änderungen mit einem Knopf speichern: 4 Punkte exakt, 3 richtige Tordifferenz
  (nicht bei Remis), 2 richtige Tendenz; Halbfinale und Finale doppelt; Europameister-Tipp
  +10.
- **Tipprunden** mit Freunden (optional): Code bzw. Link `/runde/CODE`, ohne Login, nur ein
  Name. Wer mit Code beitritt, stellt eine Anfrage – der Ersteller bekommt eine Push-Nachricht
  und nimmt in den Einstellungen der Runde (Zahnrad) an oder lehnt ab.
  Gemeinsame Tabelle, fremde Tipps erst ab Anpfiff sichtbar, Ersteller kann Mitspieler
  entfernen. Der Server sperrt Tipps ab Anpfiff. Wer in Runden ist, tippt nur dort: Die Tipps-Seite
  zeigt dann die Runden, jede Runde hat die Reiter „Tippen“ und „Tabelle“ mit eigenen Tipps und
  eigenem Europameister-Tipp. Beim Beitreten werden bisherige Einzel-Tipps übernommen.
- **Spoilerschutz** für Spielstände, Live-Stände, Tabellen, K.-o.-Baum und Europameister.
- **Erinnerungen** (Web Push) 15 Minuten vor Anpfiff, automatisch für Favoriten.
- **Offline nutzbar**: zuletzt geladener Stand bleibt, App öffnet auch im Funkloch.
- **Große Schrift** und große Tippflächen für eine bequeme Bedienung.
- **Kalender-Export** einzelner Spiele oder aller eigenen Spiele (.ics).
- **Teilen** als Bild, **Vormerken** einzelner Spiele, **Dark/Light/System** und Akzentfarben.
- **Vorschau-Modus**: spielt das Turnier mit erfundener Auslosung durch, um die App schon heute im
  Turnierzustand zu sehen. Tipprunden sind dort echt (Einladen, Anfragen, Verwaltung wie später),
  nur Ergebnisse und Punkte sind simuliert. Aufräumen: Admin-Bereich → „Alle Tipprunden löschen“.
- **Admin-Bereich** (5× auf die Versionsnummer tippen): Live-Status, Korrekturen inkl.
  Elfmeterschießen, Statistik, Feedback.

## Schnellstart

```bash
bun install        # oder npm install
bun run dev        # http://localhost:5173
```

Die App läuft **ohne jede Konfiguration**. Live-Daten kommen dann direkt von
[OpenLigaDB](https://www.openligadb.de). Für Push-Erinnerungen im Hintergrund, Admin-Korrekturen und
Statistik wird optional Supabase angebunden (siehe unten). **Für den Live-Betrieb mit vielen
Nutzern wird das Backend empfohlen**: Dann fragt nur der Server OpenLigaDB ab (mit Cache), nicht
jedes einzelne Gerät.

| Befehl              | Zweck                                        |
| ------------------- | -------------------------------------------- |
| `bun run dev`       | Entwicklungsserver                           |
| `bun run build`     | Produktions-Build (Cloudflare Worker)        |
| `bun run test`      | Unit-Tests (Vitest)                          |
| `bun run typecheck` | TypeScript prüfen                            |
| `bun run lint`      | ESLint + Prettier                            |
| `bun run check`     | Typecheck, Lint und Tests in einem Durchgang |

Produktions-Build lokal ansehen: `bun run build && cd .output && npx wrangler dev`.

## Backend (optional): Supabase

> **Ohne Computer?** Schritt-für-Schritt-Anleitung fürs iPhone: [docs/EINRICHTUNG_IPHONE.md](docs/EINRICHTUNG_IPHONE.md)

1. Neues Supabase-Projekt anlegen.
2. `supabase/migrations/20261018000000_kicktime_2028.sql` im SQL-Editor ausführen.
3. Edge Functions deployen:
   ```bash
   supabase functions deploy live-scores --no-verify-jwt
   supabase functions deploy admin --no-verify-jwt
   supabase functions deploy send-push-reminders --no-verify-jwt
   ```
4. Secrets setzen: `ADMIN_PIN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
   `CRON_SECRET` (VAPID-Schlüssel z. B. mit `npx web-push generate-vapid-keys`).
5. Cron-Job für Erinnerungen anlegen (SQL steht am Ende der Migration).
6. Die drei öffentlichen Werte (Project URL, anon key, VAPID Public Key) in
   `src/public-config.ts` eintragen – oder alternativ als `VITE_…`-Variablen (siehe
   `.env.example`), die haben Vorrang.

## Daten pflegen

Alles, was sich bis zum Turnier noch ändert (Qualifikation, Auslosung, Anstoßzeiten,
TV-Sender), wird an **zwei Stellen** eingetragen: `src/tournament/draw.ts` und
`src/tournament/tv.ts`. Eine Schritt-für-Schritt-Anleitung mit Zeitplan steht in
[docs/PFLEGE.md](docs/PFLEGE.md).

## Projektstruktur

```
src/
├── tournament/   Turnierdaten EM 2028 (Nationen, Stadien, Spielplan, K.-o.-Regeln, TV, Auslosung)
├── domain/       reine Logik + Tests (Zeitfenster, Empfehlungen, Tabellen, K.-o.-Auflösung, Live-Abgleich)
├── store/        Zustand (Einstellungen persistent, Turnierzustand berechnet)
├── services/     Live-Daten, Supabase, Admin
├── components/   UI (Spielkarte, Detail-Sheets, Tabellen, K.-o.-Baum, Onboarding, …)
├── routes/       Seiten: / · /spielplan · /turnier · /tipps · /einstellungen
├── demo/         Vorschau-Modus
└── lib/          Kalender, Push, Teilen-Bild, Theme, …
supabase/         Migration + Edge Functions (live-scores, admin, send-push-reminders)
docs/             Architektur, Pflege-Anleitung, Änderungsbericht
```

Details: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

## Lizenz

Privates Projekt, alle Rechte vorbehalten, siehe [LICENSE](LICENSE). Flaggen:
[flag-icons](https://github.com/lipis/flag-icons) (MIT). KickTime steht in keiner Verbindung zur UEFA.
