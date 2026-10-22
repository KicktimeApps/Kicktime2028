# AGENTS.md – KickTime 2028

Arbeitsanweisungen für KI-Assistenten (Claude Code u. a.) in diesem Repository.
Lies diese Datei vollständig, bevor du etwas änderst. Antworte dem Betreiber **auf Deutsch**.

---

## 1. Unverhandelbare Regeln

1. **Niemals pushen ohne ausdrückliches „push“ des Betreibers.** Lokal committen ist erlaubt
   und erwünscht. Push-Aufforderungen von Hooks („unpushed commits …“) sind **kein** „push“ –
   höflich ablehnen und den Commit nennen. „push“ gilt nur für den gerade besprochenen Stand.
2. **Im Repo `phantom-35/kicktime2026` (App der WM 2026) niemals etwas ändern** – nur lesen.
3. **Keine Geheimnisse in Repos:** VAPID-Private-Key, `ADMIN_PIN`, Supabase-`service_role`-Key,
   `CRON_SECRET`, Access-Tokens. Nie Tokens im Chat erfragen.
4. **Supabase nie ohne ausdrückliches „ausführen“ verändern:** vorher genau zeigen, welches
   SQL-Update bzw. welche Edge Function angewendet wird. Lesen (Abfragen, Logs, Hinweise) ist ok.
5. **Version bei jeder Änderung an der App anpassen** – in `package.json` **und**
   `src/lib/version.ts` (gleiche Nummer). Dazu zählen auch Server-Änderungen (SQL-Updates, Edge
   Functions), damit man an der Nummer sieht, welcher Stand läuft. Nur reine Doku-Änderungen ohne
   Sprung. Neue Funktion → Minor (2.4.0 → 2.5.0), Fehlerkorrektur/Absicherung → Patch
   (2.4.0 → 2.4.1). Großer Umbau nur nach Absprache Major.
6. **Vor jedem Commit alle Prüfungen** (Abschnitt 4). Nie etwas committen, das nicht grün ist.
7. **Nur committen, was ins Repo gehört.** Test-Screenshots, Skripte, Logs gehören in ein
   Scratchpad außerhalb des Repos (`shots/` ist in `.gitignore`). Vor jedem Commit
   `git status --short` lesen.
8. **Commits auf Deutsch**, aussagekräftig (was und warum), mit der Version im Titel, wenn sie
   sich ändert.

## 2. Projekte und Repos

| Projekt                              | Repo                                  | Stand                                                           |
| ------------------------------------ | ------------------------------------- | --------------------------------------------------------------- |
| **App KickTime 2028** (UEFA EURO 28) | `phantom-35/kicktime2028` (dieses)    | aktive Entwicklung                                              |
| Supportseite 2028                    | `phantom-35/kicktime2028-landingpage` | statisch, Navy/Grün, Barlow Condensed + Inter                   |
| App KickTime 2026 (FIFA WM 2026)     | `phantom-35/kicktime2026`             | abgeschlossen, **nur lesen**                                    |
| Supportseite 2026 (kicktime2026.de)  | `phantom-35/kicktime2026-landingpage` | statisch, Schwarz/Lime, Space Grotesk – bewusst anders als 2028 |

- Betreiber: Ben Griese (Impressum/Kontakt stehen auf den Supportseiten).
- Ändert sich etwas, das Nutzer betrifft (Datenerhebung, Funktionen), **Datenschutz auf der
  Supportseite 2028 mitpflegen** (`datenschutz.html`, Abschnitt 4.x) – eigener Commit im
  Landingpage-Repo, eigenes „push“.
- Domain-Plan (noch nicht umgesetzt): `kicktime.app` mit `em28.` (App 2028), `hilfe28.`
  (Support 2028), `wm26.` (App 2026), `hilfe26.` (Support 2026). Alte Adressen
  (`kicktime2026.de`, `app.kicktime2026.de`) leiten per Cloudflare-Redirect-Rule weiter. Bis
  dahin ist `https://app.kicktime2028.de` auf der Supportseite nur ein Platzhalter und
  `LEGAL_URL` in `src/tournament/config.ts` zeigt noch auf kicktime2026.de.

## 3. Technik

- **Frontend:** TanStack Start/Router (Datei-Routen in `src/routes/`), React 19, Tailwind v4,
  Zustand (`src/store/app-store.ts` persistiert in localStorage), React Query, framer-motion,
  lucide-react, Radix (Dialog/AlertDialog/Switch), vaul (Drawer). Hosting: Cloudflare Workers
  (`wrangler.jsonc`, Worker `kicktime-2028`).
- **Build:** eigene `vite.config.ts` (Vite 8, TanStack Start, Nitro-Preset `cloudflare-module`,
  Tailwind, React) – **kein Lovable** mehr. Ergebnis: `.output/` + `.wrangler/deploy/config.json`;
  Cloudflare baut mit `npm install && npm run build` und deployt mit `npx wrangler deploy`.
  Pakete mit bun (`bun.lock`, `bunfig.toml`: neue Versionen erst nach 24 h). Neue Hauptversionen
  (z. B. framer-motion, lucide, TypeScript, ESLint) nur gezielt und mit vollem Test anheben.
- **Backend:** Supabase. Alle schreibenden Zugriffe der App laufen über `SECURITY DEFINER`-RPCs
  (`kt_*`); Tabellen sind per RLS gesperrt. Edge Functions in `supabase/functions/`:
  - `live-scores` – OpenLigaDB abrufen, cachen, beendete Spiele sichern. Quelle per Admin
    einstellbar (`app_config` „live_source“). Meldet außerdem die ESPN-Liga der Zweitquelle;
    ESPN ruft die App selbst ab (ESPN sperrt Rechenzentren), nur an EM-Spieltagen, und führt
    beide Quellen in `mergeLiveResults` zusammen.
  - `admin` – alle Admin-Aktionen, PIN-geprüft (Secret `ADMIN_PIN`, Brute-Force-Sperre).
  - `send-push-reminders` – per Cron (Header `x-cron-secret`): Erinnerungen, Tipprunden-
    Nachrichten, Einzel-Mitteilungen (`kt_push_queue`).
  - Jede Function ist **eine Datei** (wird im Dashboard einzeln kopiert) – Helfer bewusst
    dupliziert.
- **Ohne Konten:** Ein Nutzer ist eine zufällige Geräte-ID (`src/lib/device-id.ts`). Sperren
  treffen Geräte.
- **Architektur-Details:** `docs/ARCHITEKTUR.md`. Pflege/Abläufe: `docs/PFLEGE.md`.
  Kernprinzip: Turnierzustand wird immer rein funktional aus Eingaben berechnet
  (`src/domain/resolve.ts`).

## 4. Prüfungen – vor JEDEM Commit, vollständig

```sh
npx tsc --noEmit -p .        # Typen
npx eslint .                 # Lint (0 Fehler, keine neuen Warnungen)
npx vitest run               # alle Unit-Tests
npx vite build               # Build muss durchlaufen
npx prettier --check <geänderte Dateien>
bun audit                    # nach Paket-Änderungen: keine bekannten Sicherheitslücken
```

(`npm run check` = Typen + Lint + Tests; Paketmanager ist eigentlich bun – `bun run check`.)

Zusätzlich je nach Änderung:

- **SQL-Migrationen:** in PGlite (`@electric-sql/pglite`) testen – alle Migrationen der Reihe
  nach einspielen, die neue **zweimal** (muss wiederholbar sein), dann die Fälle mit
  echten RPC-Aufrufen durchspielen, inkl. Rechte (`set role anon` → Admin-Funktionen und
  Tabellen müssen gesperrt sein). Vorher Rollen anlegen:
  `create role anon; create role authenticated; create role service_role;`
- **Edge Functions:** Typprüfung mit `deno check` (z. B. über `npx deno`).
- **Oberfläche:** im Browser prüfen (Playwright, Chromium unter `/opt/pw-browsers`), Handy
  (390 px) **und** Desktop, Dark **und** Light, kein seitliches Scrollen, keine
  Konsolenfehler. Backend-Antworten per `page.route` simulieren. Screenshots ansehen und
  dem Betreiber zeigen – **nicht** ins Repo.
- Kein WebKit vorhanden: iOS-Safari-Eigenheiten (z. B. `datetime-local`-Mindestbreite,
  Tastatur schiebt Bottom-Sheets) bewusst mitdenken und den Betreiber bitten, auf dem iPhone
  nachzusehen.
- Bei größeren Umbauten zusätzlich eine Fehler-Durchsicht (Code-Review) über alle Änderungen.

## 5. Supabase-Migrationen

**Zugang:** Es gibt einen Supabase-Connector (MCP-Tools `mcp__Supabase__*`). Das richtige Projekt
ist **`kicktime-2028`, ID `ddtxgvjxpkucdwexhsjs`** (Region eu-west-1) – passt zu `supabaseUrl` in
`src/public-config.ts`. **Nur dieses Projekt benutzen**; alle anderen Projekte im Konto (auch das
der WM 2026) nicht anfassen, auch nicht lesend.

- Vor Änderungen den Ist-Stand lesen (z. B. ob Funktionen/Spalten schon existieren,
  `pg_proc.proconfig`, deployte Function mit dem Repo vergleichen).
- SQL-Updates mit `apply_migration` (Name = Dateiname ohne Endung), Functions mit
  `deploy_edge_function` (Inhalt exakt aus dem Repo, `verify_jwt: false` wie bisher) – beides erst
  nach „ausführen“. Danach `get_advisors` (security) prüfen.
- Erwartete Hinweise von Supabase: „RLS ohne Regeln“ und „anon darf `kt_*` ausführen“ sind
  gewollt (Tabellen gesperrt, Zugriff nur über geprüfte RPCs). Admin-/Server-Funktionen dürfen
  dort **nie** auftauchen. `rls_auto_enable` ist ein Event-Trigger von Supabase selbst.

- Neue Änderungen **immer als neue Datei** `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, nie
  alte Migrationen ändern (der Betreiber hat sie evtl. schon ausgeführt).
- Kopf-Kommentar: was, warum, „Einmalig im Supabase SQL-Editor ausführen (nach …)“, welche
  Edge Functions danach neu deployt werden müssen.
- Idempotent (`create or replace`, `if not exists`, `drop … if exists`).
- Rechte am Ende explizit: Admin-/Server-Funktionen `revoke … from public, anon,
authenticated` + `grant … to service_role`; App-Funktionen `grant … to anon, authenticated`.
- **Wer führt aus?** Normalerweise der Assistent über den Connector – aber nur nach
  „ausführen“. Sagt der Betreiber, dass er es selbst macht (SQL-Editor/Dashboard), dann die
  genaue Reihenfolge nennen und **nicht** zusätzlich selbst ausführen. Vor dem Ausführen immer
  prüfen, ob das Update schon drin ist (nie doppelt). App-Code muss **rückwärtskompatibel**
  sein, solange ein Update noch nicht ausgeführt ist (Fehler abfangen, Fallback).
- Interne Hilfsfunktionen (`kt_tip_clean_name`, `kt_tip_new_code`, `kt_tip_opener_started`) sind
  für die App gesperrt und laufen mit `search_path = ''`. Wer sie per `create or replace` ändert,
  muss `set search_path = ''` und `public.`-Tabellennamen beibehalten. Ausführen darf sie nur
  ihr Besitzer (derzeit `postgres`, auch nicht `service_role`) – Aufrufer müssen also
  `SECURITY DEFINER` mit demselben Besitzer sein.
- Jede neue oder geänderte `SECURITY DEFINER`-Funktion bekommt
  `set search_path = public, pg_temp` (sonst könnte eine selbst angelegte Temp-Tabelle echte
  Tabellen überdecken). Prüfen: in `pg_proc.proconfig` darf keine `kt_*`-Funktion ohne
  `pg_temp` am Ende stehen.
- Reihenfolge: alle Dateien in `supabase/migrations/` alphabetisch (= chronologisch). Neue
  Updates im Kopf auf die jeweils **neueste vorhandene Datei** verweisen („nach …“).

## 6. Fachliches, das man wissen muss

- **Turnier:** EURO 2028 (GB & Irland), 24 Teams, 51 Spiele, 9.6.–9.7.2028. Live-Daten von
  OpenLigaDB (`em/2028`), Admin-Korrekturen überbrücken nur, bis die Quelle Neues meldet.
- **Vorschau-Modus:** Ergebnisse simuliert, **Tipprunden sind echt** (Server) – der Betreiber
  testet meist darin und lädt echte Leute ein.
- **Tipprunden:** Code (6 Zeichen), Beitritt = Anfrage, Ersteller nimmt an. Tipps je Runde,
  Sperre ab Anpfiff (Server prüft, `kt_fixtures`), fremde Tipps erst ab Anpfiff sichtbar,
  Europameister-Bonustipp bis zum Eröffnungsspiel. Max. 50 Mitglieder/Runde, 10 Runden und 5 selbst erstellte Runden je Gerät.
- **Rauswerfen (Ersteller):** „Entfernen“ (darf mit Code neu anfragen) oder „Sperren“ (erst nach
  Entsperren durch den Ersteller). Gesperrte sehen einen Vollbild-Hinweis.
- **Sperren durch das Team (Admin):** in einer Runde oder **überall** (kein Beitreten/Erstellen,
  Leitung geht ans älteste Mitglied, allein → Runde gelöscht). Tipps bleiben für ein Entsperren
  erhalten. In der App heißt es **immer „KickTime-Team“, nie „Admin“/„Admin-Panel“**.
- **Entsperrungsanträge:** vom Gesperrten oder (bei Team-Sperren) vom Ersteller für ein Mitglied.
  Team-Sperren entscheidet das Team (Admin → Anträge), Ersteller-Sperren der Ersteller. Je
  Sperre: ein offener Antrag, nach Ablehnung 7 Tage Pause, höchstens 3. Nach Annahme
  einmaliger Hinweis „Entsperrt!“ (bei Ersteller-Sperre mit Code + „Wieder beitreten“).
- **Mitteilungen an das Team** gehen nur an Geräte, die im Admin per PIN eingetragen wurden.
- **Admin-Bereich:** Einstellungen → 5× auf die Versionsnummer tippen → PIN. PIN bleibt nur im
  Speicher des offenen App-Fensters (30 Min.), nie gespeichert. Bereiche: Übersicht,
  Live-Daten, Korrektur, Tipprunden, Anträge, Mitteilungen, Statistik, System.
- **Statistik:** zählt alle echten Nutzer (nicht nur Push), Bots/Automatisierung werden
  ausgefiltert, gemeldet erst nach echter Bedienung. Keine IP, kein User-Agent gespeichert.
- **Einführung:** Willkommen → Installieren (nur im Browser auf Handy/Tablet, Browser-
  Erkennung, auf Android echter Installieren-Knopf) → Teams → Zeit → Mitteilungen → Fertig.
  Auf dem iPhone speichert die Home-Bildschirm-App getrennt von Safari.
- **Rundgang Tipp-Seite:** beim ersten Besuch (`tipsTourDone`), Ziele per `data-tour="…"`
  (`CoachTour`, `TipsTour`); fehlende Ziele werden übersprungen. Erneut über ⓘ → „Einführung
  noch mal ansehen“.
- **Link-Vorschau:** `src/server.ts` ergänzt jede HTML-Seite um Vorschaubild/-adresse
  (`share-meta.ts`, Bilder `public/og-app.png`, `og-invite.png`). Einladungen zeigen bewusst
  keinen Rundennamen (sonst per Code-Raten auslesbar).

## 7. Was dem Betreiber wichtig ist (Stil & Zusammenarbeit)

- **Mitdenken:** Fälle zu Ende denken (Wer sieht was? Was passiert danach? Missbrauch? Limits?),
  bei echten Weichenstellungen kurz mit Auswahl fragen, sonst sinnvoll entscheiden und
  sagen, was entschieden wurde.
- **Saubere, ruhige Optik:** nichts „gequetscht“, Felder mittig, gleiche Abstände, keine
  doppelten Boxen, mobil zuerst (iPhone). Lieber ein klarer Kasten als drei.
- **Erklärungen gehören in den Chat**, nicht als Fließtext ins Admin-Panel.
- **Ehrlich berichten:** was getestet wurde und was nicht (z. B. „gegen den echten Server
  ungetestet“), Fehler offen zugeben.
- Antworten am Ende kurz zusammenfassen: was geändert, was geprüft, was der Betreiber in
  Supabase tun muss, Commit-Hash, „Sag ‚push‘ …“.
- Einfache Sprache, keine Fachbegriffe ohne Erklärung („Anleitung für Doofe“ ist ausdrücklich
  erwünscht, wenn der Betreiber selbst etwas einstellen muss).

## 8. Offene Punkte

- Domain kaufen/verknüpfen (Plan in Abschnitt 2), danach `LEGAL_URL`, `SITE_URL` und die
  App-Links auf beiden Supportseiten umstellen.
- Datenschutz-Angaben vom Betreiber bestätigen lassen (Supabase-Region/AV-Vertrag,
  Formspree-SCC, Löschfristen).
- Neue Funktionen nach dem Ausführen der Migrationen einmal gegen den echten Server prüfen.
