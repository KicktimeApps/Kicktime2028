-- KickTime 2028 – Update: Admin-Korrekturen überbrücken nur.
-- Die Korrektur merkt sich, was die Live-Quelle (OpenLigaDB) beim Speichern
-- gemeldet hat. Meldet die Quelle danach etwas Neues, gilt wieder die Quelle.
-- Einmalig im Supabase SQL-Editor ausführen (bei Neuinstallation nicht nötig).
alter table public.match_overrides add column if not exists source_sig text;
