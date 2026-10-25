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
  dahin ist `https://app.kicktime2028.de` auf der Supportseite nur ein Platzhalter.
  `LEGAL_URL` (`src/tournament/config.ts`) zeigt auf die Supportseite 2028
  `https://kicktime2028-landingpage.ben-online35.workers.dev` (`/datenschutz`, `/impressum`).

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
    Nachrichten, Einzel-Mitteilungen (`kt_push_queue`). Supabase erlaubt 2 s Rechenzeit pro
    Aufruf: höchstens `MAX_REMINDERS_PER_RUN` (300) Spiel- + Tipp-Erinnerungen je Lauf, der Rest
    wird wieder freigegeben (nächste Minute); VAPID-Signatur je Push-Dienst zwischengespeichert
    (~0,4 ms je Nachricht). Staut es sich (≥ 600 fällig), meldet der Wächter „push-stau“ – dann
    mehrere Aufrufe je Minute einplanen. Lasttest: 1000 gleichzeitige in 4 Minuten, keine verloren.
  - Jede Function ist **eine Datei** (wird im Dashboard einzeln kopiert) – Helfer bewusst
    dupliziert.
- **Ohne Konten:** Ein Nutzer ist eine zufällige Geräte-ID (`src/lib/device-id.ts`). Sperren
  treffen Geräte. **Handywechsel** (Einstellungen → „Handy wechseln“, auch in der Einführung):
  Der Wiederherstellungs-Code ist die Geräte-ID selbst (32 Zeichen 0–9/A–F); das neue Gerät
  übernimmt sie (`adoptDeviceId`) und damit Tipprunden, Tipps, Push und Sperren. Vorher zeigt
  `groupsOfDevice` die Runden zum Code. Lokale Einstellungen wandern nicht mit. Der Code ist
  geheim (wer ihn hat, tippt im Namen des Geräts). Neu installiert = neue ID = Runden weg, daher
  einmaliger Hinweis „Sichere deinen Code“ in der Rundenliste (`BackupCodeHint`,
  `codeBackupDone`) und Eintrag „Code für neues Handy“ in den Runden-Einstellungen.
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
Dieselben Prüfungen laufen bei jedem Push auf GitHub (`.github/workflows/pruefungen.yml`),
dazu **Browser-Tests** der wichtigsten Abläufe (`e2e/*.e2e.ts`, Playwright 1.56.1, Handy + Desktop,
Server per `page.route` nachgestellt – nie echte Daten). Lokal:
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers bunx playwright test`. Neue Abläufe dort mit abdecken.

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
  Geprüft mit echten EM-2024-Daten (Okt. 2026): `em/2024` und ESPN `uefa.euro` lieferten alle 51
  Spiele, Ergebnisse identisch. `em/2028` ist dort noch leer – die Community legt die Liga erst
  vor dem Turnier an; vorher im KickTime-Team-Bereich → Live-Daten → „Testen“ prüfen, ggf.
  Kürzel umstellen. Achtung: OpenLigaDB-Teamnamen können falsch sein (2024 hieß Frankreich
  „SV Großefehn“) – die Zuordnung fällt dann auf Tag + Stadion/Uhrzeit zurück. Elfmeterschießen-
  Tore stehen in der normalen Torliste (Minute 120, `isPenalty`) und zählen nicht zum Spielstand.
- **Vorschau-Modus:** Ergebnisse simuliert, **Tipprunden sind echt** (Server) – der Betreiber
  testet meist darin und lädt echte Leute ein. „Vorschau neu starten“ (Einstellungen → Vorschau-Modus,
  `restartDemo`) setzt Uhr, Vorschau-Tipps und Vorschau-Feier zurück und lädt neu. Die Vorschau übernimmt
  **keine** Live-Daten und keine Korrekturen. Korrekturen (Team-Bereich → Korrektur) gelten immer
  für die echten Spiele (gleiche Spielnummern!) – darum dort im Vorschau-Modus gesperrt, nur
  „Echte Korrekturen entfernen“ bleibt.
- **Tipprunden:** Code (6 Zeichen), Beitritt = Anfrage, Ersteller nimmt an. Tipps je Runde,
  Sperre ab Anpfiff (Server prüft, `kt_fixtures`), fremde Tipps erst ab Anpfiff sichtbar,
  Europameister-Bonustipp bis zum Eröffnungsspiel. Pillen „Tippen“ · „Vergleich“ · „Tabelle“:
  „Vergleich“ (`TipCompare.tsx`, `domain/compare.ts`) zeigt alle Tipps mit Punkten wie bei
  Kicktipp: Spieltag wie beim Tippen (`rounds.ts`, über mehrere Tage), im Kopf immer 3 Spiele
  (Desktop 6), mit ◀ ▶ oder Wischen blättern; rechts P (Spieltag) und G (gesamt).
  Laufende Spiele zählen mit dem Zwischenstand **vorläufig** mit (`buildBoard(…, { live: true })`,
  rot markiert, „+N live“ in der Tabelle); Spoilerschutz gilt auch dafür. Max. 50 Mitglieder/Runde, 10 Runden und 5 selbst erstellte Runden je Gerät.
- **Rauswerfen (Ersteller):** „Entfernen“ (darf mit Code neu anfragen) oder „Sperren“ (erst nach
  Entsperren durch den Ersteller). Gesperrte sehen einen Vollbild-Hinweis.
- **Sperren durch das Team (Admin):** in einer Runde oder **überall** (kein Beitreten/Erstellen,
  Leitung geht ans älteste Mitglied, allein → Runde gelöscht). Tipps bleiben für ein Entsperren
  erhalten. In der App heißt es **immer „KickTime-Team“, nie „Admin“/„Admin-Panel“**.
- **Entsperrungsanträge:** vom Gesperrten oder (bei Team-Sperren) vom Ersteller für ein Mitglied.
  Team-Sperren entscheidet das Team (Admin → Anträge), Ersteller-Sperren der Ersteller. Je
  Sperre: ein offener Antrag, nach Ablehnung 7 Tage Pause, höchstens 3. Nach Annahme
  einmaliger Hinweis „Entsperrt!“ (bei Ersteller-Sperre mit Code + „Wieder beitreten“).
- **Mitteilungen an das Team** gehen nur an Geräte, die im Admin per PIN eingetragen wurden
  (`app_config` „admin_devices“, Schalter `TeamDeviceRow` unter Anträge und im Wächter). Neue
  Installation = neue Geräte-ID → altes Gerät „tot“: die Karte warnt, Eintragen sortiert Geräte
  ohne Mitteilungs-Abo aus, der Wächter-Test überspringt sie. Zustell-Bestätigung:
  `send-push-reminders` schreibt je Team-Gerät die letzte Zustellung bzw. den letzten Fehler in
  `kt_team_delivery`, die Wächter-Karte zeigt sie (lädt ~70 s nach einem Test neu).
- **Aufräumen:** `kt_push_cleanup` (täglich 3:07 UTC aus `send-push-reminders`) löscht Abos, die
  60 Tage nicht gemeldet wurden – nur ohne anstehende Erinnerung, Tipprunde oder Team-Eintrag.
- **Team-App** (Repo `phantom-35/kicktime2028-admin`, ab 2.15.0): eigenes Kontrollzentrum mit
  allen Team-Funktionen, nutzt dieselben Edge Functions. Dafür in `admin`: `find_person`,
  `group_board`, `team_log` (SQL-Update `20261025180000_team_app.sql`) und das Team-Protokoll
  (`kt_team_log`, jede ändernde Aktion mit Klartext; `by` = Geräte-ID aus `services/admin.ts`).
  `src/domain/`, `src/tournament/`, `services/admin.ts` u. a. sind dort Kopien – nach Änderungen
  dort mit `node scripts/sync-check.mjs ../Kicktime2028 --copy` übernehmen.
  **Face ID (ab 2.16.0, nur Team-App):** `admin` kennt `passkey_*`-Aktionen (Tabellen
  `kt_team_passkeys`, `kt_team_challenges`, SQL-Update `20261025200000_team_passkeys.sql`,
  Paket `npm:@simplewebauthn/server@13.2.2`). Nach Face ID gilt eine signierte Freigabe
  `s1.…` (HMAC mit `SUPABASE_SERVICE_ROLE_KEY`, 4 Std.) statt der PIN; Einrichten nur mit PIN.
  Die KickTime-App selbst nutzt das nicht.
- **Admin-Bereich:** Einstellungen → 5× auf die Versionsnummer tippen → PIN (Zählung in
  `lib/secret-taps.ts`; die Zeile ist bewusst kein Knopf und nicht markierbar, damit nichts
  die Stelle verrät – die Version schickt das Feedback ohnehin automatisch mit). PIN bleibt nur im
  Speicher des offenen App-Fensters (30 Min.), nie gespeichert. Bereiche: Übersicht,
  Live-Daten, Korrektur, Tipprunden, Anträge, Mitteilungen, Statistik, System.
- **Statistik:** zählt alle echten Nutzer (nicht nur Push), Bots/Automatisierung werden
  ausgefiltert, gemeldet erst nach echter Bedienung. Keine IP, kein User-Agent gespeichert.
- **Einführung:** Willkommen → Installieren (nur im Browser auf Handy/Tablet, Browser-
  Erkennung, auf Android echter Installieren-Knopf) → Hell/Dunkel (dunkel empfohlen und
  vorausgewählt) → Teams → Zeit → Mitteilungen → Fertig.
  Auf dem iPhone speichert die Home-Bildschirm-App getrennt von Safari.
- **Rundgang Tipp-Seite:** beim ersten Besuch (`tipsTourDone`), Ziele per `data-tour="…"`
  (`CoachTour`, `TipsTour`); dazu ein eigener Rundgang beim ersten Öffnen einer Tipprunde (`roundTourDone`, `RoundTour`). Fehlende Ziele werden übersprungen. Erneut über ⓘ → „Einführung
  noch mal ansehen“.
- **Wächter (ab 2.11.0):** `send-push-reminders` prüft rund um jedes Spiel alle 2 Minuten
  (OpenLigaDB über `live-scores`, Spiel läuft/abgeschlossen, Abruf pausiert, Liga leer) und
  wertet Meldungen der Geräte aus (`kt_report_source`: ESPN/Server, `services/source-report.ts`).
  Probleme und „wieder in Ordnung“ gehen per `kt_alert_set` → `kt_push_team` an die
  eingetragenen Team-Geräte (bei Fortbestehen alle 30 Min.). Vor dem Turnier täglich 8 Uhr UTC
  Prüfung „Liga leer“. Anzeige + Test-Mitteilung im Team-Bereich → Live-Daten (`WatchCard`).
- **Tipp-Erinnerung:** eine Stunde vor Anpfiff „Noch kein Tipp“ an bestätigte Mitglieder ohne
  Tipp (`kt_claim_tip_reminders`, je Gerät und Spiel einmal, abschaltbar unter Erinnerungen).
  Paarung kommt aus `kt_fixtures.title` (Team-Bereich → „Anstoßzeiten abgleichen“, nie aus
  dem Vorschau-Modus).
- **Update-Hinweis:** `/version.json` (Server-Version) – `useUpdateCheck` bietet bei neuerer
  Version „Aktualisieren“ an. `sw.js` speichert `/version.json` nie.
- **Einladen per QR-Code:** `components/common/QrCode.tsx` (Paket `uqr`), in der Tipprunde unter
  „Tabelle“.
- **Schutz-Header:** `src/server.ts` setzt über `lib/security-headers.ts` u. a. kein Einbetten in
  fremde Seiten, `nosniff`, HSTS und sperrt Kamera/Mikrofon/Standort. Bewusst keine volle CSP
  (Startskripte stehen inline). Nutzt die App neue Browser-Rechte, dort freigeben.
- **Link-Vorschau:** `src/server.ts` ergänzt jede HTML-Seite um Vorschaubild/-adresse
  (`share-meta.ts`, Bilder `public/og-app.png`, `og-invite.png`). Einladungen zeigen bewusst
  keinen Rundennamen (sonst per Code-Raten auslesbar).
- **Druck-Rückmeldung (wie iOS):** `lib/press-feedback.ts` (in `__root.tsx` eingebunden) – Knöpfe,
  Links und Reiter werden beim Antippen blasser (55 %) und blenden weich zurück, kein Einsinken.
  Auf Touch erst nach 70 ms, Bewegung > 10 px oder Scrollen bricht ab (Scrollen löst nichts
  aus); sehr kurze Tipper blinken einmal auf. Web Animations API, daher unabhängig von
  transition-Klassen. Ausnahme: `data-no-press` am Element oder einem Vorfahren.
- **Spoilerschutz Tabellen/K.-o.-Baum/Teams** (`turnier.tsx`, `domain/table-spoiler.ts`): „Anzeigen“
  speichert den Ergebnisstand (`tablesSeen`, je Spiel „id:status:h-a“) – bleibt über Seitenwechsel
  und Neustart offen, bis ein neues Ergebnis/Tor kommt. Einzeln aufgedeckte Spiele zählen mit.
  Aufdecken animiert: Hinweis klappt zu, Zahlen werden weich scharf, Zeilen gleiten an den Platz.
- **Feinschliff (ab 2.7.0):** iPhone-Startbilder `public/startup/` (aus dem echten Ladebildschirm
  gerendert, je Gerät hell/dunkel, in `__root.tsx` verlinkt – bei Änderungen am Ladebildschirm
  neu erzeugen). Seitenwechsel überblenden (`defaultViewTransition`). Tor-Moment: Ziffer rutscht
  herein (`GoalScore.tsx`), Karte leuchtet (`useGoalFlash.ts`), Hinweis „⚽ Tor für …“ nur für
  eigene/gefolgte Teams und nie bei aktivem Spoilerschutz (`useGoalAlerts.ts`). Platzhalter
  statt „Lade…“: `Skeleton.tsx`. Stadien auf der Startseite verlinken `/spielplan?q=…`.

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
