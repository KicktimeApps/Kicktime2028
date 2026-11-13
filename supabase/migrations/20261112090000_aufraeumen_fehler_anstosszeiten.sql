-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Löschfristen, Fehlermeldungen, Anstoßzeiten, Absicherung“
--
--  - kt_retention_cleanup: löscht, was die Datenschutzerklärung zusagt –
--    Tipprunden, Anträge und Sperren sechs Monate nach dem letzten Spiel,
--    Nutzungs-Einträge von Geräten, die 180 Tage nicht da waren, Feedback nach
--    einem Jahr, Fehlermeldungen nach 30 Tagen. Läuft täglich aus
--    send-push-reminders (zusammen mit kt_push_cleanup).
--  - kt_client_errors + kt_report_error: Die App meldet Fehler (Art, kurzer Text,
--    Version) – sichtbar in der Team-App. Begrenzt je Gerät und insgesamt.
--  - kt_send_feedback / kt_submit_feedback: zusätzlich eine Obergrenze für alle
--    zusammen (300 am Tag) – Geräte-IDs kann man sich ausdenken.
--  - match_overrides.locked: „Korrektur festhalten“ – sie gilt dann auch, wenn
--    die Live-Quelle etwas anderes meldet (z. B. manipulierte Community-Daten).
--  - kt_fixture_pending + kt_fixture_propose: Der Server übernimmt geänderte
--    Anstoßzeiten der Live-Quelle selbst in die Tipp-Sperre – aber erst, wenn
--    sie einen Tag lang gleich gemeldet wurden, nie in den letzten 24 Stunden vor
--    dem Spiel und nie bei Sprüngen über 36 Stunden. Jede Übernahme steht im
--    Team-Protokoll und geht als Mitteilung ans Team.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach
-- 20261025220000_geraet_vergessen_waechter.sql). Danach die Edge Functions
-- `admin`, `live-scores` und `send-push-reminders` neu deployen.
-- ════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------- Korrektur festhalten

alter table public.match_overrides add column if not exists locked boolean not null default false;

-- ---------------------------------------------------------------- Fehlermeldungen der App

create table if not exists public.kt_client_errors (
  id bigint generated always as identity primary key,
  device_id uuid not null,
  category text not null,
  message text not null,
  app_version text,
  created_at timestamptz not null default now()
);
create index if not exists kt_client_errors_recent on public.kt_client_errors (created_at desc);
alter table public.kt_client_errors enable row level security;

create or replace function public.kt_report_error(
  p_device uuid, p_category text, p_message text, p_version text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  msg text := left(nullif(trim(p_message), ''), 200);
begin
  if p_device is null or msg is null
     or p_category is null or p_category not in ('api', 'supabase', 'push', 'render', 'system') then
    return;
  end if;
  -- Je Gerät höchstens 5 in der Stunde, dieselbe Meldung nur einmal am Tag.
  if (select count(*) from kt_client_errors e
       where e.device_id = p_device and e.created_at > now() - interval '1 hour') >= 5 then
    return;
  end if;
  if exists (select 1 from kt_client_errors e
              where e.device_id = p_device and e.message = msg
                and e.created_at > now() - interval '1 day') then
    return;
  end if;
  -- Schutz gegen Fluten: höchstens 300 in der Stunde insgesamt.
  if (select count(*) from kt_client_errors e
       where e.created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  insert into kt_client_errors (device_id, category, message, app_version)
  values (p_device, p_category, msg, left(p_version, 20));
end;
$$;

-- ---------------------------------------------------------------- Feedback: Obergrenze für alle

create or replace function public.kt_send_feedback(
  p_device uuid,
  p_category text,
  p_rating smallint,
  p_message text,
  p_version text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  msg text := left(nullif(trim(p_message), ''), 1000);
begin
  if p_rating is not null and p_rating not between -1 and 1 then
    raise exception 'invalid rating';
  end if;
  if p_category is not null and p_category not in ('idee', 'fehler', 'lob', 'sonstiges') then
    raise exception 'invalid category';
  end if;
  if p_rating is null and msg is null then
    raise exception 'feedback empty';
  end if;
  if (select count(*) from app_feedback
       where device_id = p_device and created_at > now() - interval '1 day') >= 3 then
    raise exception 'feedback limit';
  end if;
  if (select count(*) from app_feedback
       where created_at > now() - interval '1 day') >= 300 then
    raise exception 'feedback limit';
  end if;
  insert into app_feedback (device_id, rating, message, app_version, category)
  values (p_device, p_rating, msg, left(p_version, 20), p_category);
end;
$$;

create or replace function public.kt_submit_feedback(
  p_device uuid, p_rating smallint, p_message text, p_version text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_rating not between -1 and 1 then
    raise exception 'invalid rating';
  end if;
  if (select count(*) from app_feedback
       where device_id = p_device and created_at > now() - interval '1 day') >= 3 then
    raise exception 'feedback limit';
  end if;
  if (select count(*) from app_feedback
       where created_at > now() - interval '1 day') >= 300 then
    raise exception 'feedback limit';
  end if;
  insert into app_feedback (device_id, rating, message, app_version)
  values (p_device, p_rating, left(nullif(trim(p_message), ''), 1000), left(p_version, 20));
end;
$$;

-- ---------------------------------------------------------------- Anstoßzeiten übernehmen

create table if not exists public.kt_fixture_pending (
  match_id text primary key,
  kickoff_utc timestamptz not null,
  first_seen timestamptz not null default now()
);
alter table public.kt_fixture_pending enable row level security;

-- Rückgabe: same | pending | adopted | blocked | unknown
create or replace function public.kt_fixture_propose(p_match text, p_kickoff timestamptz)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cur timestamptz;
  pend kt_fixture_pending;
begin
  select kickoff_utc into cur from kt_fixtures where match_id = p_match;
  if cur is null or p_kickoff is null then
    return 'unknown';
  end if;
  if abs(extract(epoch from (p_kickoff - cur))) <= 300 then
    delete from kt_fixture_pending where match_id = p_match;
    return 'same';
  end if;
  -- Kurz vor dem Spiel und bei großen Sprüngen entscheidet ein Mensch.
  if cur <= now() + interval '24 hours' or p_kickoff <= now() + interval '24 hours'
     or abs(extract(epoch from (p_kickoff - cur))) > 36 * 3600 then
    return 'blocked';
  end if;
  select * into pend from kt_fixture_pending where match_id = p_match;
  if pend.match_id is not null and pend.kickoff_utc = p_kickoff
     and pend.first_seen <= now() - interval '20 hours' then
    update kt_fixtures set kickoff_utc = p_kickoff where match_id = p_match;
    delete from kt_fixture_pending where match_id = p_match;
    insert into kt_team_log (action, detail)
    values ('fixtures_auto',
            'Anstoßzeit ' || p_match || ' automatisch übernommen: '
            || to_char(cur at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') || ' → '
            || to_char(p_kickoff at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') || ' Uhr');
    perform kt_push_team(
      'KickTime: Anstoßzeit übernommen',
      'Spiel ' || ltrim(substr(p_match, 2), '0') || ': jetzt '
      || to_char(p_kickoff at time zone 'Europe/Berlin', 'DD.MM. HH24:MI')
      || ' Uhr (vorher ' || to_char(cur at time zone 'Europe/Berlin', 'DD.MM. HH24:MI')
      || '). Die Tipp-Sperre gilt ab der neuen Zeit.',
      '/einstellungen', 'fixture-' || p_match);
    return 'adopted';
  end if;
  insert into kt_fixture_pending (match_id, kickoff_utc, first_seen)
  values (p_match, p_kickoff, now())
  on conflict (match_id) do update
    set first_seen = case when kt_fixture_pending.kickoff_utc = excluded.kickoff_utc
                          then kt_fixture_pending.first_seen else now() end,
        kickoff_utc = excluded.kickoff_utc;
  return 'pending';
end;
$$;

-- ---------------------------------------------------------------- Löschfristen

create or replace function public.kt_retention_cleanup()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  last_kickoff timestamptz;
  n_groups int := 0;
  n_pings int;
  n_feedback int;
  n_errors int;
begin
  -- Sechs Monate nach dem letzten Spiel: Tipprunden (mit Mitgliedern, Tipps,
  -- Ereignissen), Entsperrungsanträge und Sperren.
  -- Nur was zu diesem Turnier gehört (vor dessen Ende angelegt): Stehen einmal
  -- versehentlich alte Anstoßzeiten in kt_fixtures, bleibt Neueres unberührt.
  select max(kickoff_utc) into last_kickoff from kt_fixtures;
  if last_kickoff is not null and now() > last_kickoff + interval '180 days' then
    delete from tip_groups where created_at < last_kickoff + interval '30 days';
    get diagnostics n_groups = row_count;
    delete from kt_unban_requests where created_at < last_kickoff + interval '30 days';
    delete from kt_device_bans where created_at < last_kickoff + interval '30 days';
    delete from kt_tip_reminders_sent where kickoff_utc <= last_kickoff;
  end if;
  delete from app_pings where last_ping < now() - interval '180 days';
  get diagnostics n_pings = row_count;
  delete from app_feedback where created_at < now() - interval '365 days';
  get diagnostics n_feedback = row_count;
  delete from kt_client_errors where created_at < now() - interval '30 days';
  get diagnostics n_errors = row_count;
  delete from kt_fixture_pending where first_seen < now() - interval '30 days';
  return jsonb_build_object('groups', n_groups, 'pings', n_pings,
                            'feedback', n_feedback, 'errors', n_errors);
end;
$$;

-- ---------------------------------------------------------------- Rechte

revoke all on public.kt_client_errors, public.kt_fixture_pending from anon, authenticated;

revoke all on function public.kt_report_error(uuid, text, text, text) from public;
grant execute on function public.kt_report_error(uuid, text, text, text) to anon, authenticated;
revoke all on function public.kt_send_feedback(uuid, text, smallint, text, text) from public;
grant execute on function public.kt_send_feedback(uuid, text, smallint, text, text)
  to anon, authenticated;
revoke all on function public.kt_submit_feedback(uuid, smallint, text, text) from public;
grant execute on function public.kt_submit_feedback(uuid, smallint, text, text)
  to anon, authenticated;

revoke all on function public.kt_fixture_propose(text, timestamptz) from public, anon, authenticated;
grant execute on function public.kt_fixture_propose(text, timestamptz) to service_role;
revoke all on function public.kt_retention_cleanup() from public, anon, authenticated;
grant execute on function public.kt_retention_cleanup() to service_role;
