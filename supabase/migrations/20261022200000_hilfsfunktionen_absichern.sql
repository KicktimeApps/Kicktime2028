-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Hilfsfunktionen absichern“
--
-- Ergänzt 20261022180000_suchpfad_hilfsfunktionen:
--  - Leerer Suchpfad (search_path = '') und voll ausgeschriebene Tabellen-
--    namen (public.…) – so empfiehlt es Supabase; auch temporäre Tabellen
--    können nichts mehr unterschieben.
--  - Der Suchpfad steht jetzt in der Definition selbst. Wer die Funktionen
--    später mit „create or replace“ ändert, sieht ihn und verliert ihn nicht.
--  - Rechte ausdrücklich: nur der Server (service_role) darf sie direkt
--    aufrufen, die App nicht.
--
-- Wichtig für spätere Änderungen: Die drei Funktionen werden nur intern von
-- den Tipprunden-Funktionen (kt_tip_create, kt_tip_join, kt_tip_rename,
-- kt_tip_board, kt_tip_set_champion …) benutzt. Die laufen als SECURITY
-- DEFINER mit demselben Besitzer (postgres) – nur deshalb dürfen sie die
-- Hilfsfunktionen trotz Sperre aufrufen. Neue Aufrufer müssen ebenfalls
-- SECURITY DEFINER mit Besitzer postgres sein.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261022180000_suchpfad_hilfsfunktionen.sql).
-- Keine Edge Function betroffen.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.kt_tip_clean_name(p_name text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(n) < 2 or char_length(n) > 20 then
    raise exception 'name invalid';
  end if;
  return n;
end;
$$;

-- Code ohne verwechselbare Zeichen (kein 0/O, 1/I/L)
create or replace function public.kt_tip_new_code() returns text
language plpgsql set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.tip_groups where code = c);
  end loop;
  return c;
end;
$$;

create or replace function public.kt_tip_opener_started() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select min(kickoff_utc) <= now() from public.kt_fixtures), false);
$$;

revoke all on function public.kt_tip_clean_name(text) from public, anon, authenticated;
revoke all on function public.kt_tip_new_code() from public, anon, authenticated;
revoke all on function public.kt_tip_opener_started() from public, anon, authenticated;
grant execute on function public.kt_tip_clean_name(text) to service_role;
grant execute on function public.kt_tip_new_code() to service_role;
grant execute on function public.kt_tip_opener_started() to service_role;
