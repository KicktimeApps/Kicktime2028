-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Suchpfad Hilfsfunktionen“
--
-- Supabase-Sicherheitshinweis „Function Search Path Mutable“: Die drei
-- Hilfsfunktionen der Tipprunden bekommen einen festen Suchpfad. Außerdem
-- sind sie von außen nicht mehr aufrufbar – sie werden nur intern von den
-- Tipprunden-Funktionen benutzt (die laufen mit Besitzerrechten weiter).
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261022150000_korrekturen_sperren.sql).
-- Keine Edge Function betroffen.
-- ════════════════════════════════════════════════════════════════════════

alter function public.kt_tip_clean_name(text) set search_path = public;
alter function public.kt_tip_new_code() set search_path = public;
alter function public.kt_tip_opener_started() set search_path = public;

revoke all on function public.kt_tip_clean_name(text) from public, anon, authenticated;
revoke all on function public.kt_tip_new_code() from public, anon, authenticated;
revoke all on function public.kt_tip_opener_started() from public, anon, authenticated;
