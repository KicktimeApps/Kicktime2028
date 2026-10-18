# Pflege-Anleitung: Was bis zur EM 2028 noch zu tun ist

Stand der Daten (Oktober 2026): **Spielplan, Spielorte und K.-o.-Baum stehen fest** (UEFA,
12.11.2025). **Teilnehmer, Auslosung, genaue Anstoßzeiten und die TV-Zuteilung stehen noch nicht
fest.** Die App zeigt dafür Platzhalter und kennzeichnet vorläufige Uhrzeiten. Alles Weitere
trägst du an diesen Stellen ein:

| Was                            | Datei                                   | Wann                                  |
| ------------------------------ | --------------------------------------- | ------------------------------------- |
| Qualifizierte Teams            | `src/tournament/draw.ts` → `QUALIFIED`  | laufend bis Nov. 2027 / März 2028      |
| In der Quali ausgeschieden     | `draw.ts` → `ELIMINATED_IN_QUALIFYING`  | laufend                               |
| Endrunden-Auslosung            | `draw.ts` → `DRAW`                      | nach der Auslosung (ca. Dez. 2027)     |
| Offizielle Anstoßzeiten        | `draw.ts` → `CONFIRMED_KICKOFFS`        | kurz nach der Auslosung               |
| Free-TV-Sender pro Spiel       | `src/tournament/tv.ts` → `FREE_TV`      | sobald ARD/ZDF die Verteilung melden   |
| Nur bei MagentaTV              | `tv.ts` → `MAGENTA_EXCLUSIVE`           | ebenso                                |
| Live-Datenquelle               | `.env` → `VITE_OPENLIGA_LEAGUE/SEASON`  | prüfen, sobald OpenLigaDB die EM anlegt |

Nach jeder Änderung: `bun run check`, danach deployen.

## 1. Qualifikation (März 2027 – März 2028)

```ts
// src/tournament/draw.ts
export const QUALIFIED = ["ENG", "FRA", "ESP"]; // FIFA-Kürzel, siehe nations.ts
export const ELIMINATED_IN_QUALIFYING = ["SMR", "GIB"];
```

Die Teamliste unter **Turnier → Teams** und die Status-Chips („Qualifiziert“, „Nicht
qualifiziert“) aktualisieren sich dann von selbst.

Zu den Gastgebern: Höchstens zwei der vier Gastgeber (ENG, SCO, WAL, IRL) bekommen einen
automatischen Startplatz, und das nur, wenn sie sich nicht regulär qualifizieren. Einfach
eintragen, wer am Ende dabei ist.

## 2. Endrunden-Auslosung

Jeder Slot `A1`…`F4` bekommt ein Team. Die Nummer bestimmt die Paarungen im Spielplan:

```ts
export const DRAW = {
  A1: "WAL", A2: "…", A3: "…", A4: "…",
  B1: "ENG", …
};
```

Gesetzt sind (falls qualifiziert): **A1 Wales** (alle Gruppenspiele in Cardiff), **B1 England**
(Manchester, dann 2× Wembley), **E1 Irland** (alle in Dublin) und **F1 Schottland** (alle in
Glasgow). Ab dann zeigt KickTime automatisch die eigenen Spiele, Tabellen und Tipps an.
Achtelfinale, Viertelfinale usw. füllen sich während des Turniers von selbst, inklusive der
UEFA-Tabelle für die vier besten Gruppendritten.

> Tipp: Den eingetragenen Stand vor dem Deployment im Vorschau-Modus gegenprüfen. Der arbeitet
> zwar mit einer eigenen, erfundenen Auslosung, zeigt aber, wie sich die Ansichten verhalten.

## 3. Anstoßzeiten

Bis dahin nutzt KickTime die offiziellen Zeitfenster (15/18/21 Uhr MESZ) als Platzhalter.
Bestätigte Zeiten trägst du **in UTC** ein (MESZ minus 2 Stunden):

```ts
export const CONFIRMED_KICKOFFS = {
  1: "2028-06-09T19:00:00Z", // 21:00 MESZ
  2: "2028-06-10T13:00:00Z", // 15:00 MESZ
};
```

Fest steht schon jetzt: Das Finale beginnt am 9.7.2028 um 18:00 MESZ.

Sobald OpenLigaDB die EM führt, übernimmt die App die offiziellen Zeiten zusätzlich automatisch
aus den Live-Daten. Dabei gleicht sie über Spieltag und Stadion ab, die Teams müssen dafür
nicht bekannt sein.

## 4. TV-Sender

Bekannt ist: ARD und ZDF zeigen 34 Spiele im Free-TV (alle Deutschland-Spiele, 5 Achtelfinals,
2 Viertelfinals, beide Halbfinals, das Finale), MagentaTV zeigt alle 51 (17 davon exklusiv).

```ts
// src/tournament/tv.ts
export const FREE_TV = { 1: "ZDF", 51: "ARD" };
export const MAGENTA_EXCLUSIVE = [6, 12];
```

Ohne Eintrag zeigt die App ehrliche Hinweise wie „ARD/ZDF · MagentaTV“ (Deutschland-Spiel,
Halbfinale, Finale) oder „MagentaTV · Free-TV offen“.

## 5. Live-Daten prüfen (ab Frühjahr 2028)

- OpenLigaDB hat die EURO 2024 unter `em/2024` geführt, für 2028 ist `em/2028` voreingestellt.
  Testen mit: `https://api.openligadb.de/getmatchdata/em/2028`. Falls OpenLigaDB ein anderes
  Kürzel nutzt, `VITE_OPENLIGA_LEAGUE`/`VITE_OPENLIGA_SEASON` (Frontend) bzw. die Secrets
  `OPENLIGA_LEAGUE`/`OPENLIGA_SEASON` (Edge Function) setzen.
- OpenLigaDB wird von der Community gepflegt. Fehlerhafte Einträge (etwa Testteams wie
  „SV Großefehn“ bei der EM 2024) ignoriert KickTime. Falsche Spielstände korrigierst du im
  **Admin-Bereich → Korrektur**. Eine Korrektur gilt so lange, bis die Quelle das Spielende
  oder mehr Tore meldet.
- Elfmeterschießen: OpenLigaDB führt das Ergebnis „nach Elfmeterschießen“ nicht immer
  einheitlich (mal mit, mal ohne die Tore aus dem Spiel). Der **Sieger** wird in beiden Fällen
  richtig erkannt; sollte die angezeigte Elfmeterzahl nicht stimmen, im Admin-Bereich korrigieren.
- Im Admin-Bereich → System siehst du Quelle, letzten Abruf und die Zahl der Spiele, die die App
  nicht zuordnen konnte.

## 6. Checkliste vor dem Turnier (Mai/Juni 2028)

- [ ] `QUALIFIED`, `DRAW` und `CONFIRMED_KICKOFFS` vollständig
- [ ] TV-Zuteilung eingetragen
- [ ] OpenLigaDB-Kürzel geprüft, im Admin → System „Nicht zugeordnet: 0“
- [ ] Supabase: Migration, Edge Functions und Secrets aktuell, Cron-Job aktiv
- [ ] Push-Test: Erinnerung für ein Spiel stellen, Nachricht kommt an
- [ ] Impressums-Link (`VITE_LEGAL_URL`) zeigt auf die richtige Seite
- [ ] `bun run check` grün, Vorschau-Modus einmal durchgeklickt

## 7. Für ein neues Turnier (z. B. WM 2030)

Die Turnierdaten liegen gekapselt in `src/tournament/`. Diese Dateien ersetzt du:
`config.ts` (Name, Daten, Gruppen, Storage-Präfix), `nations.ts`, `venues.ts`, `schedule.ts`,
`bracket.ts` (K.-o.-Struktur und ggf. Drittplatzierten-Regel), `tv.ts` und `draw.ts`.
Die Logik in `src/domain/` ist turnierunabhängig. Anpassen musst du sie nur bei einem anderen
Format, z. B. 48 Teams mit Sechzehntelfinale; dann `Stage`-Typ und `STAGE_*` erweitern.
