-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Admin-Ausbau“
--
--  - Einstellungen zur Laufzeit (app_config): Live-Quelle (Liga, Saison,
--    API-Endung, Pause) und ein Hinweis-Banner für alle Nutzer.
--  - Nutzungs-Statistik mit Plattform, Browser, installiert/Push und
--    Tagesverlauf (app_daily). Weiter anonym: zufällige Geräte-ID, kein
--    User-Agent, keine IP.
--  - Admin-Funktionen für Tipprunden (ansehen, Mitglieder entfernen,
--    Ersteller übertragen, einzelne Runden löschen).
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261020120000_push_absicherung.sql).
-- Danach die Edge Functions `admin` und `live-scores` neu deployen.
-- ════════════════════════════════════════════════════════════════════════

-- ---------- Einstellungen -------------------------------------------------

create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- Nur der Hinweis-Banner ist öffentlich lesbar; die Live-Quelle liest nur der Server.
grant select on public.app_config to anon, authenticated;
drop policy if exists "banner lesbar" on public.app_config;
create policy "banner lesbar" on public.app_config
  for select to anon, authenticated using (key = 'announcement');

-- ---------- Nutzungs-Statistik --------------------------------------------

alter table public.app_pings add column if not exists first_seen timestamptz;
alter table public.app_pings add column if not exists platform   text;
alter table public.app_pings add column if not exists browser    text;
alter table public.app_pings add column if not exists installed  boolean;
alter table public.app_pings add column if not exists push_on    boolean;
alter table public.app_pings add column if not exists pings      int not null default 1;
update public.app_pings set first_seen = last_ping where first_seen is null;
alter table public.app_pings alter column first_seen set default now();

-- Ein Eintrag pro Gerät und Tag (deutsche Zeit) – für den Verlauf.
create table if not exists public.app_daily (
  day        date not null,
  client_id  uuid not null,
  primary key (day, client_id)
);
alter table public.app_daily enable row level security;
revoke all on public.app_daily from anon, authenticated;

drop function if exists public.kt_ping(uuid, text, text);
create or replace function public.kt_ping(
  p_client uuid, p_version text, p_fav text,
  p_platform text default null, p_browser text default null,
  p_installed boolean default null, p_push boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  pf text := case when p_platform in ('ios', 'android', 'desktop', 'other') then p_platform end;
  br text := case when p_browser ~ '^[a-z]{2,12}$' then p_browser end;
begin
  insert into app_pings (client_id, last_ping, first_seen, app_version, fav_team,
                         platform, browser, installed, push_on, pings)
  values (p_client, now(), now(), left(p_version, 20), left(p_fav, 3), pf, br, p_installed, p_push, 1)
  on conflict (client_id) do update
    set last_ping = now(),
        app_version = excluded.app_version,
        fav_team = excluded.fav_team,
        platform = coalesce(excluded.platform, app_pings.platform),
        browser = coalesce(excluded.browser, app_pings.browser),
        installed = coalesce(excluded.installed, app_pings.installed),
        push_on = coalesce(excluded.push_on, app_pings.push_on),
        pings = app_pings.pings + 1;
  insert into app_daily (day, client_id)
  values ((now() at time zone 'Europe/Berlin')::date, p_client)
  on conflict do nothing;
end;
$$;

revoke all on function public.kt_ping(uuid, text, text, text, text, boolean, boolean) from public;
grant execute on function public.kt_ping(uuid, text, text, text, text, boolean, boolean)
  to anon, authenticated;

-- Alles für die Statistik-Seite in einem Aufruf.
create or replace function public.kt_admin_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  out jsonb;
begin
  delete from app_daily where day < today - 180;
  select jsonb_build_object(
    'online',  (select count(*) from app_pings where last_ping > now() - interval '10 minutes'),
    'today',   (select count(*) from app_daily where day = today),
    'day',     (select count(*) from app_pings where last_ping > now() - interval '24 hours'),
    'week',    (select count(*) from app_pings where last_ping > now() - interval '7 days'),
    'month',   (select count(*) from app_pings where last_ping > now() - interval '30 days'),
    'total',   (select count(*) from app_pings),
    'new7',    (select count(*) from app_pings where first_seen > now() - interval '7 days'),
    'returning7', (select count(*) from app_pings
                    where last_ping > now() - interval '7 days'
                      and first_seen < now() - interval '7 days'),
    'installed', (select count(*) from app_pings
                   where installed and last_ping > now() - interval '30 days'),
    'pushOn',  (select count(*) from app_pings
                 where push_on and last_ping > now() - interval '30 days'),
    'subscriptions', (select count(*) from push_subscriptions),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day::date, 'count', coalesce(c.n, 0)) order by d.day)
        from generate_series(today - 13, today, interval '1 day') as d(day)
        left join (select day, count(*) n from app_daily where day >= today - 13 group by day) c
          on c.day = d.day::date
    ), '[]'::jsonb),
    'platforms', coalesce((
      select jsonb_object_agg(k, n) from (
        select coalesce(platform, 'unbekannt') k, count(*) n from app_pings
         where last_ping > now() - interval '30 days' group by 1) x
    ), '{}'::jsonb),
    'browsers', coalesce((
      select jsonb_object_agg(k, n) from (
        select coalesce(browser, 'unbekannt') k, count(*) n from app_pings
         where last_ping > now() - interval '30 days' group by 1) x
    ), '{}'::jsonb),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object('version', k, 'count', n) order by n desc) from (
        select coalesce(app_version, '?') k, count(*) n from app_pings
         where last_ping > now() - interval '30 days' group by 1 order by 2 desc limit 6) x
    ), '[]'::jsonb),
    'topTeams', coalesce((
      select jsonb_agg(jsonb_build_object('team', k, 'count', n) order by n desc) from (
        select fav_team k, count(*) n from app_pings
         where fav_team is not null group by 1 order by 2 desc limit 8) x
    ), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

-- ---------- Tipprunden verwalten ------------------------------------------

create or replace function public.kt_admin_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) from (
    select g.id, g.code, g.name, g.created_at,
           (select m.name from tip_members m
             where m.group_id = g.id and m.device_id = g.owner_device) as owner,
           (select count(*) from tip_members m
             where m.group_id = g.id and not m.banned and m.approved) as members,
           (select count(*) from tip_members m
             where m.group_id = g.id and not m.banned and not m.approved) as pending,
           (select count(*) from tip_members m where m.group_id = g.id and m.banned) as banned,
           (select count(*) from tip_predictions p where p.group_id = g.id) as tips
      from tip_groups g
  ) x;
$$;

create or replace function public.kt_admin_group(p_group uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'memberId', m.member_id,
           'name', m.name,
           'owner', m.device_id = g.owner_device,
           'approved', m.approved,
           'banned', m.banned,
           'joinedAt', m.joined_at,
           'tips', (select count(*) from tip_predictions p
                     where p.group_id = m.group_id and p.device_id = m.device_id),
           'champion', (select b.champion from tip_bonus b
                         where b.group_id = m.group_id and b.device_id = m.device_id)
         ) order by m.banned, not m.approved, m.joined_at), '[]'::jsonb)
    from tip_members m join tip_groups g on g.id = m.group_id
   where m.group_id = p_group;
$$;

-- Entfernen (darf wieder beitreten) oder sperren (dauerhaft).
create or replace function public.kt_admin_remove_member(p_group uuid, p_member uuid, p_ban boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  dev uuid;
  g tip_groups;
  heir uuid;
begin
  select device_id into dev from tip_members where group_id = p_group and member_id = p_member;
  if dev is null then raise exception 'not found'; end if;
  select * into g from tip_groups where id = p_group;
  delete from tip_predictions where group_id = p_group and device_id = dev;
  delete from tip_bonus where group_id = p_group and device_id = dev;
  if p_ban then
    update tip_members set banned = true where group_id = p_group and member_id = p_member;
  else
    delete from tip_members where group_id = p_group and member_id = p_member;
  end if;
  -- War es der Ersteller, übernimmt das am längsten dabei befindliche Mitglied.
  if g.owner_device = dev then
    select device_id into heir from tip_members
     where group_id = p_group and not banned and approved and device_id <> dev
     order by joined_at limit 1;
    if heir is null then
      delete from tip_groups where id = p_group;
    else
      update tip_groups set owner_device = heir where id = p_group;
    end if;
  end if;
end;
$$;

create or replace function public.kt_admin_unban(p_group uuid, p_member uuid) returns void
language sql security definer set search_path = public as $$
  delete from tip_members where group_id = p_group and member_id = p_member and banned;
$$;

create or replace function public.kt_admin_transfer(p_group uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  dev uuid;
begin
  select device_id into dev from tip_members
   where group_id = p_group and member_id = p_member and not banned and approved;
  if dev is null then raise exception 'not found'; end if;
  update tip_groups set owner_device = dev where id = p_group;
end;
$$;

create or replace function public.kt_admin_delete_group(p_group uuid) returns void
language sql security definer set search_path = public as $$
  delete from tip_push_queue where group_id = p_group;
  delete from tip_groups where id = p_group;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'kt_admin_stats()', 'kt_admin_groups()', 'kt_admin_group(uuid)',
    'kt_admin_remove_member(uuid, uuid, boolean)', 'kt_admin_unban(uuid, uuid)',
    'kt_admin_transfer(uuid, uuid)', 'kt_admin_delete_group(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
