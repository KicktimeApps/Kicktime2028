-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Zustell-Bestätigung und Aufräumen“
--
--  Zustell-Bestätigung (nur Team-Geräte):
--  - kt_team_delivery: je eingetragenem Team-Gerät die letzte erfolgreiche und
--    die letzte fehlgeschlagene Zustellung (mit Fehlercode). Schreibt die Edge
--    Function send-push-reminders, liest die Edge Function admin – damit der
--    KickTime-Team-Bereich zeigt, ob Warnungen wirklich ankommen.
--
--  Aufräumen:
--  - kt_push_cleanup(): löscht Mitteilungs-Abos, die seit 60 Tagen nicht mehr
--    gemeldet wurden (App gelöscht oder neu installiert) – aber nur, wenn das
--    Gerät keine anstehenden Erinnerungen hat, in keiner Tipprunde ist und
--    kein Team-Gerät ist. Läuft einmal täglich aus send-push-reminders.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261023130000_waechter_tipperinnerung.sql).
-- Danach die Edge Functions `send-push-reminders` und `admin` neu deployen.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.kt_team_delivery (
  device_id uuid primary key,
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  last_status integer,
  last_title text
);
alter table public.kt_team_delivery enable row level security;

-- Server: alte Abos löschen. Gibt die Anzahl gelöschter Abos zurück.
create or replace function public.kt_push_cleanup()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  with gone as (
    delete from push_subscriptions s
     where s.last_seen_at < now() - interval '60 days'
       and not exists (select 1 from match_alarms a
                        where a.device_id = s.device_id and a.kickoff_utc > now())
       and not exists (select 1 from tip_members m where m.device_id = s.device_id)
       and not exists (select 1 from app_config c,
                              jsonb_array_elements_text(coalesce(c.value -> 'devices', '[]'::jsonb)) d
                        where c.key = 'admin_devices' and d = s.device_id::text)
    returning 1
  )
  select count(*)::integer into n from gone;
  delete from kt_team_delivery t
   where not exists (select 1 from push_subscriptions s where s.device_id = t.device_id)
     and coalesce(t.last_ok_at, t.last_fail_at) < now() - interval '60 days';
  return n;
end;
$$;

-- ---------------------------------------------------------------- Rechte

revoke all on public.kt_team_delivery from anon, authenticated;

revoke all on function public.kt_push_cleanup() from public, anon, authenticated;
grant execute on function public.kt_push_cleanup() to service_role;
