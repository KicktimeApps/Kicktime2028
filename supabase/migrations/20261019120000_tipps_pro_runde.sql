-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Tipps pro Runde“
--
-- Jede Tipprunde hat eigene Tipps und einen eigenen Europameister-Tipp.
-- Gespeichert wird einzeln per „Tipp speichern“; der Server lehnt Tipps ab
-- Anpfiff ab und meldet das zurück.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261019000000_tipprunde.sql).
-- Achtung: Tipps aus der ersten Tipprunden-Version (ohne Runde) werden dabei
-- verworfen – sie ließen sich keiner Runde zuordnen.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tip_predictions' and column_name = 'group_id'
  ) then
    drop table if exists public.tip_predictions;
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tip_bonus' and column_name = 'group_id'
  ) then
    drop table if exists public.tip_bonus;
  end if;
end;
$$;

drop function if exists public.kt_tip_save(uuid, jsonb, text);

create table if not exists public.tip_predictions (
  group_id    uuid not null references public.tip_groups (id) on delete cascade,
  device_id   uuid not null,
  match_id    text not null,
  home        smallint not null check (home between 0 and 30),
  away        smallint not null check (away between 0 and 30),
  updated_at  timestamptz not null default now(),
  primary key (group_id, device_id, match_id)
);

create table if not exists public.tip_bonus (
  group_id    uuid not null references public.tip_groups (id) on delete cascade,
  device_id   uuid not null,
  champion    text not null check (champion ~ '^[A-Z]{3}$'),
  updated_at  timestamptz not null default now(),
  primary key (group_id, device_id)
);

alter table public.tip_predictions enable row level security;
alter table public.tip_bonus enable row level security;
revoke all on public.tip_predictions, public.tip_bonus from anon, authenticated;

-- ---------- Hilfen ----------------------------------------------------------

create or replace function public.kt_tip_require_member(p_device uuid, p_group uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from tip_members where group_id = p_group and device_id = p_device and not banned
  ) then
    raise exception 'not a member';
  end if;
end;
$$;

-- ---------- Einzelnen Tipp speichern / löschen ------------------------------

create or replace function public.kt_tip_set(
  p_device uuid, p_group uuid, p_match text, p_home int, p_away int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  k timestamptz;
begin
  perform kt_tip_require_member(p_device, p_group);
  select kickoff_utc into k from kt_fixtures where match_id = p_match;
  if k is null then
    raise exception 'unknown match';
  end if;
  if k <= now() then
    raise exception 'match started';
  end if;
  if p_home not between 0 and 30 or p_away not between 0 and 30 then
    raise exception 'invalid score';
  end if;
  insert into tip_predictions (group_id, device_id, match_id, home, away)
  values (p_group, p_device, p_match, p_home, p_away)
  on conflict (group_id, device_id, match_id)
  do update set home = excluded.home, away = excluded.away, updated_at = now();
end;
$$;

create or replace function public.kt_tip_clear(p_device uuid, p_group uuid, p_match text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform kt_tip_require_member(p_device, p_group);
  if exists (select 1 from kt_fixtures where match_id = p_match and kickoff_utc <= now()) then
    raise exception 'match started';
  end if;
  delete from tip_predictions
   where group_id = p_group and device_id = p_device and match_id = p_match;
end;
$$;

-- Beim Beitreten: bisherige Einzel-Tipps für offene Spiele übernehmen
-- (vorhandene Tipps in der Runde werden nicht überschrieben).
create or replace function public.kt_tip_import(p_device uuid, p_group uuid, p_tips jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  list jsonb := coalesce(p_tips, '[]'::jsonb);
  n int;
begin
  perform kt_tip_require_member(p_device, p_group);
  if jsonb_typeof(list) <> 'array' or jsonb_array_length(list) > 60 then
    raise exception 'invalid tips';
  end if;
  insert into tip_predictions (group_id, device_id, match_id, home, away)
  select distinct on (x->>'match_id')
         p_group, p_device, x->>'match_id',
         least(30, greatest(0, (x->>'home')::int)), least(30, greatest(0, (x->>'away')::int))
    from jsonb_array_elements(list) x
    join kt_fixtures f on f.match_id = x->>'match_id'
   where f.kickoff_utc > now()
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Europameister-Tipp der Runde; null löscht ihn. Ab Eröffnungsspiel gesperrt.
create or replace function public.kt_tip_set_champion(p_device uuid, p_group uuid, p_champion text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform kt_tip_require_member(p_device, p_group);
  if kt_tip_opener_started() then
    raise exception 'champion locked';
  end if;
  if p_champion is null then
    delete from tip_bonus where group_id = p_group and device_id = p_device;
  elsif p_champion ~ '^[A-Z]{3}$' then
    insert into tip_bonus (group_id, device_id, champion) values (p_group, p_device, p_champion)
    on conflict (group_id, device_id) do update set champion = excluded.champion, updated_at = now();
  else
    raise exception 'invalid team';
  end if;
end;
$$;

-- ---------- Tabelle: Tipps dieser Runde ----------------------------------

create or replace function public.kt_tip_board(p_device uuid, p_group uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  started boolean := kt_tip_opener_started();
begin
  perform kt_tip_require_member(p_device, p_group);
  select * into g from tip_groups where id = p_group;
  return jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name,
                                'isOwner', g.owner_device = p_device),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.member_id, 'name', m.name,
               'isOwner', m.device_id = g.owner_device,
               'isMe', m.device_id = p_device,
               'champion', case when started or m.device_id = p_device then (
                 select b.champion from tip_bonus b
                  where b.group_id = p_group and b.device_id = m.device_id) end,
               'tips', (
                 select coalesce(jsonb_object_agg(t.match_id,
                          jsonb_build_object('home', t.home, 'away', t.away)), '{}'::jsonb)
                   from tip_predictions t
                   join kt_fixtures f on f.match_id = t.match_id
                  where t.group_id = p_group and t.device_id = m.device_id
                    and (f.kickoff_utc <= now() or m.device_id = p_device)
               )
             ) order by m.joined_at), '[]'::jsonb)
        from tip_members m where m.group_id = p_group and not m.banned
    )
  );
end;
$$;

-- ---------- Rechte ----------------------------------------------------------

revoke all on function public.kt_tip_require_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kt_tip_set(uuid, uuid, text, int, int) from public;
revoke all on function public.kt_tip_clear(uuid, uuid, text) from public;
revoke all on function public.kt_tip_import(uuid, uuid, jsonb) from public;
revoke all on function public.kt_tip_set_champion(uuid, uuid, text) from public;
grant execute on function public.kt_tip_set(uuid, uuid, text, int, int) to anon, authenticated;
grant execute on function public.kt_tip_clear(uuid, uuid, text) to anon, authenticated;
grant execute on function public.kt_tip_import(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.kt_tip_set_champion(uuid, uuid, text) to anon, authenticated;
grant execute on function public.kt_tip_board(uuid, uuid) to anon, authenticated;
