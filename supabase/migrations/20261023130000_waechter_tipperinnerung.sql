-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Wächter und Tipp-Erinnerung“
--
--  Wächter (Mitteilungen ans KickTime-Team, wenn Live-Daten ausfallen):
--  - kt_alerts: aktuelle und frühere Probleme. kt_alert_set meldet ein Problem
--    (sofort, bei Fortbestehen alle 30 Minuten erneut) und die Behebung
--    („wieder in Ordnung“) über kt_push_team an die eingetragenen Team-Geräte.
--  - kt_source_reports: Geräte melden Ausfälle der Zweitquelle ESPN bzw. des
--    eigenen Servers (kt_report_source, höchstens alle 5 Minuten je Gerät).
--    ESPN sperrt Rechenzentren, darum kann das nur die App selbst prüfen.
--  - Geprüft wird in der Edge Function send-push-reminders (jede Minute).
--
--  Tipp-Erinnerung („Noch kein Tipp“):
--  - Etwa eine Stunde vor Anpfiff eine Mitteilung an Mitglieder von Tipprunden,
--    die für das Spiel noch keinen Tipp haben – je Gerät und Spiel einmal.
--  - In der App abschaltbar (push_subscriptions.tip_reminders).
--  - kt_fixtures.title: Paarung für den Text („Deutschland – Schottland“),
--    kommt mit dem Abgleich der Anstoßzeiten aus dem KickTime-Team-Bereich.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261023090000_feedback_kategorie.sql).
-- Danach die Edge Functions `send-push-reminders` und `admin` neu deployen.
-- ════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------- Wächter

create table if not exists public.kt_alerts (
  key text primary key,
  message text not null,
  active boolean not null default true,
  first_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz,
  resolved_at timestamptz
);
alter table public.kt_alerts enable row level security;

create table if not exists public.kt_source_reports (
  id bigint generated always as identity primary key,
  device_id uuid not null,
  source text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists kt_source_reports_recent
  on public.kt_source_reports (source, created_at);
alter table public.kt_source_reports enable row level security;

-- App: Ausfall einer Quelle melden (espn = Zweitquelle, backend = eigener Server).
create or replace function public.kt_report_source(p_device uuid, p_source text, p_detail text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_device is null or p_source is null or p_source not in ('espn', 'backend') then
    return;
  end if;
  -- Je Gerät und Quelle höchstens alle 5 Minuten.
  if exists (select 1 from kt_source_reports r
              where r.device_id = p_device and r.source = p_source
                and r.created_at > now() - interval '5 minutes') then
    return;
  end if;
  -- Schutz gegen Fluten: höchstens 500 Meldungen pro Stunde insgesamt.
  if (select count(*) from kt_source_reports r
       where r.created_at > now() - interval '1 hour') >= 500 then
    return;
  end if;
  insert into kt_source_reports (device_id, source, detail)
  values (p_device, p_source, left(coalesce(p_detail, ''), 200));
  delete from kt_source_reports r where r.created_at < now() - interval '2 days';
end;
$$;

-- Server: Meldungen der letzten 15 Minuten je Quelle.
create or replace function public.kt_source_summary()
returns table (source text, devices integer, reports integer, last_detail text)
language sql security definer set search_path = public, pg_temp as $$
  select r.source,
         count(distinct r.device_id)::integer,
         count(*)::integer,
         (array_agg(r.detail order by r.created_at desc))[1]
    from kt_source_reports r
   where r.created_at > now() - interval '15 minutes'
   group by r.source;
$$;

-- Server: Problem melden (p_active = true) oder als behoben markieren (false).
create or replace function public.kt_alert_set(p_key text, p_active boolean, p_message text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a kt_alerts;
begin
  select * into a from kt_alerts k where k.key = p_key for update;
  if p_active then
    if a.key is null or not a.active then
      insert into kt_alerts (key, message, active, first_at, last_seen_at, last_sent_at, resolved_at)
      values (p_key, left(p_message, 300), true, now(), now(), now(), null)
      on conflict (key) do update
        set message = excluded.message, active = true, first_at = now(),
            last_seen_at = now(), last_sent_at = now(), resolved_at = null;
      perform kt_push_team('⚠️ KickTime: Problem', left(p_message, 200), '/einstellungen',
                           'alert-' || p_key);
    else
      update kt_alerts k set message = left(p_message, 300), last_seen_at = now()
       where k.key = p_key;
      if a.last_sent_at is null or a.last_sent_at < now() - interval '30 minutes' then
        update kt_alerts k set last_sent_at = now() where k.key = p_key;
        perform kt_push_team('⚠️ KickTime: Problem besteht weiter', left(p_message, 200),
                             '/einstellungen', 'alert-' || p_key);
      end if;
    end if;
  elsif a.key is not null and a.active then
    update kt_alerts k set active = false, resolved_at = now() where k.key = p_key;
    perform kt_push_team('✅ KickTime: wieder in Ordnung', left('Behoben: ' || a.message, 200),
                         '/einstellungen', 'alert-' || p_key);
  end if;
end;
$$;

-- Server: Probleme, die seit 2 Stunden niemand mehr prüft (z. B. Spiel vorbei),
-- still schließen; alte Einträge nach 14 Tagen löschen.
create or replace function public.kt_alerts_tidy()
returns void
language sql security definer set search_path = public, pg_temp as $$
  update kt_alerts k set active = false, resolved_at = now()
   where k.active and k.last_seen_at < now() - interval '2 hours';
  delete from kt_alerts k
   where not k.active and k.resolved_at < now() - interval '14 days';
$$;

-- ------------------------------------------------------- Tipp-Erinnerung

alter table public.push_subscriptions
  add column if not exists tip_reminders boolean not null default true;
alter table public.kt_fixtures add column if not exists title text;

create table if not exists public.kt_tip_reminders_sent (
  device_id uuid not null,
  match_id text not null,
  kickoff_utc timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (device_id, match_id)
);
alter table public.kt_tip_reminders_sent enable row level security;

-- App: Tipp-Erinnerung an/aus. Gibt false zurück, wenn das Gerät kein Abo hat.
create or replace function public.kt_set_tip_reminders(p_device uuid, p_on boolean)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update push_subscriptions s set tip_reminders = coalesce(p_on, true)
   where s.device_id = p_device;
  return found;
end;
$$;

-- Server: fällige Tipp-Erinnerungen holen (Anpfiff in 45–60 Minuten, noch kein
-- Tipp, noch nicht erinnert). Markiert sie als verschickt. Verschiebt sich die
-- Anstoßzeit, wird erneut erinnert.
create or replace function public.kt_claim_tip_reminders()
returns table (device_id uuid, title text, body text, url text, tag text,
               endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  delete from kt_tip_reminders_sent x where x.sent_at < now() - interval '3 days';
  return query
    with due as (
      select f.match_id, f.kickoff_utc,
             coalesce(nullif(f.title, ''),
                      (select a.title from match_alarms a
                        where a.match_id = f.match_id and a.title <> '' limit 1)) as mtitle
        from kt_fixtures f
       where f.kickoff_utc > now() + interval '45 minutes'
         and f.kickoff_utc <= now() + interval '60 minutes'
    ),
    missing as (
      select m.device_id as dev, d.match_id as mid, d.kickoff_utc as ko, d.mtitle,
             g.name as gname, g.code as gcode, g.created_at as gcreated
        from due d
        join tip_members m on m.approved and not m.banned
        join tip_groups g on g.id = m.group_id
       where not exists (select 1 from tip_predictions p
                          where p.group_id = m.group_id and p.device_id = m.device_id
                            and p.match_id = d.match_id)
         and not exists (select 1 from kt_tip_reminders_sent s
                          where s.device_id = m.device_id and s.match_id = d.match_id
                            and s.kickoff_utc = d.kickoff_utc)
    ),
    per_device as (
      select dev, mid, ko, max(mtitle) as mtitle, count(*)::integer as n,
             (array_agg(gname order by gcreated))[1] as gname,
             (array_agg(gcode order by gcreated))[1] as gcode
        from missing
       group by dev, mid, ko
    ),
    -- Läuft immer vollständig mit (auch ohne Abo), damit niemand doppelt erinnert wird.
    marked as (
      insert into kt_tip_reminders_sent (device_id, match_id, kickoff_utc)
      select dev, mid, ko from per_device
      on conflict (device_id, match_id) do update
        set kickoff_utc = excluded.kickoff_utc, sent_at = now()
      returning 1
    )
    select p.dev,
           'Noch kein Tipp ⚽'::text,
           coalesce(p.mtitle, 'Dein nächstes Spiel') || ' – Anpfiff in einer Stunde. ' ||
             case when p.n > 1
                  then 'In „' || p.gname || '“ und ' ||
                       case when p.n = 2 then 'einer weiteren Runde'
                            else (p.n - 1) || ' weiteren Runden' end || ' fehlt dein Tipp.'
                  else 'In „' || p.gname || '“ fehlt noch dein Tipp.' end,
           '/runde/' || p.gcode,
           'tipp-' || p.mid,
           s.endpoint, s.p256dh, s.auth
      from per_device p
      join push_subscriptions s on s.device_id = p.dev and s.tip_reminders;
end;
$$;

-- ---------------------------------------------------------------- Rechte

revoke all on public.kt_alerts, public.kt_source_reports, public.kt_tip_reminders_sent
  from anon, authenticated;

revoke all on function public.kt_report_source(uuid, text, text) from public;
grant execute on function public.kt_report_source(uuid, text, text) to anon, authenticated;
revoke all on function public.kt_set_tip_reminders(uuid, boolean) from public;
grant execute on function public.kt_set_tip_reminders(uuid, boolean) to anon, authenticated;

revoke all on function public.kt_source_summary() from public, anon, authenticated;
grant execute on function public.kt_source_summary() to service_role;
revoke all on function public.kt_alert_set(text, boolean, text) from public, anon, authenticated;
grant execute on function public.kt_alert_set(text, boolean, text) to service_role;
revoke all on function public.kt_alerts_tidy() from public, anon, authenticated;
grant execute on function public.kt_alerts_tidy() to service_role;
revoke all on function public.kt_claim_tip_reminders() from public, anon, authenticated;
grant execute on function public.kt_claim_tip_reminders() to service_role;
