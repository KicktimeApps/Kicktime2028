/**
 * Erzeugt SQL mit den Anstoßzeiten aller 51 Spiele für die Tipprunden-Sperre
 * (Tabelle kt_fixtures). Nach dem Eintragen offizieller Zeiten in
 * src/tournament/draw.ts erneut ausführen und das Ergebnis im Supabase
 * SQL-Editor laufen lassen:
 *
 *   npm run fixtures:sql
 */
import { FIXTURES, matchId } from "../src/tournament/schedule";

const rows = FIXTURES.map((f) => `  ('${matchId(f.number)}', '${f.kickoffUtc}')`).join(",\n");
console.log(`insert into public.kt_fixtures (match_id, kickoff_utc) values
${rows}
on conflict (match_id) do update set kickoff_utc = excluded.kickoff_utc;`);
