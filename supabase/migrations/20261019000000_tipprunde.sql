-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Tipprunde & Feedback-Limit“
--
-- Einmalig im Supabase SQL-Editor ausführen. Kann gefahrlos mehrfach laufen.
-- ════════════════════════════════════════════════════════════════════════

-- ---------- Feedback: höchstens 3 pro Gerät und Tag ------------------------
create index if not exists app_feedback_device_idx on public.app_feedback (device_id, created_at);

create or replace function public.kt_submit_feedback(
  p_device uuid, p_rating smallint, p_message text, p_version text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_rating not between -1 and 1 then
    raise exception 'invalid rating';
  end if;
  if (select count(*) from app_feedback
       where device_id = p_device and created_at > now() - interval '1 day') >= 3 then
    raise exception 'feedback limit';
  end if;
  insert into app_feedback (device_id, rating, message, app_version)
  values (p_device, p_rating, left(nullif(trim(p_message), ''), 1000), left(p_version, 20));
end;
$$;

revoke all on function public.kt_submit_feedback(uuid, smallint, text, text) from public;
grant execute on function public.kt_submit_feedback(uuid, smallint, text, text) to anon, authenticated;

-- Direktes Eintragen ist jetzt nicht mehr nötig (nur noch über die Funktion).
revoke insert on public.app_feedback from anon, authenticated;
drop policy if exists "feedback anlegen" on public.app_feedback;

-- ════════════════════════════════════════════════════════════════════════
-- Tipprunde mit Freunden
--
-- Ohne Login: Jedes Gerät hat eine zufällige, geheime Geräte-ID. Öffentlich
-- sichtbar ist nur eine davon unabhängige Mitglieds-ID. Alles läuft über
-- SECURITY-DEFINER-Funktionen; die Tabellen sind für den Browser gesperrt.
-- Tipps anderer sind erst ab Anpfiff sichtbar, Tipps werden ab Anpfiff
-- nicht mehr angenommen (Anstoßzeiten aus kt_fixtures).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.kt_fixtures (
  match_id     text primary key,
  kickoff_utc  timestamptz not null
);

create table if not exists public.tip_groups (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null check (char_length(name) between 2 and 40),
  owner_device  uuid not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.tip_members (
  group_id    uuid not null references public.tip_groups (id) on delete cascade,
  device_id   uuid not null,
  member_id   uuid not null default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 20),
  banned      boolean not null default false,
  joined_at   timestamptz not null default now(),
  primary key (group_id, device_id),
  unique (member_id)
);
create unique index if not exists tip_members_name_idx
  on public.tip_members (group_id, lower(name)) where not banned;
create index if not exists tip_members_device_idx on public.tip_members (device_id);

create table if not exists public.tip_predictions (
  device_id   uuid not null,
  match_id    text not null,
  home        smallint not null check (home between 0 and 30),
  away        smallint not null check (away between 0 and 30),
  updated_at  timestamptz not null default now(),
  primary key (device_id, match_id)
);

create table if not exists public.tip_bonus (
  device_id   uuid primary key,
  champion    text check (champion ~ '^[A-Z]{3}$'),
  updated_at  timestamptz not null default now()
);

alter table public.kt_fixtures     enable row level security;
alter table public.tip_groups      enable row level security;
alter table public.tip_members     enable row level security;
alter table public.tip_predictions enable row level security;
alter table public.tip_bonus       enable row level security;
revoke all on public.kt_fixtures, public.tip_groups, public.tip_members,
  public.tip_predictions, public.tip_bonus from anon, authenticated;

-- Anstoßzeiten (vorläufig; nach Bekanntgabe mit „npm run fixtures:sql“ erneuern)
insert into public.kt_fixtures (match_id, kickoff_utc) values
  ('m01', '2028-06-09T19:00:00Z'),
  ('m02', '2028-06-10T13:00:00Z'),
  ('m03', '2028-06-10T16:00:00Z'),
  ('m04', '2028-06-10T19:00:00Z'),
  ('m05', '2028-06-11T13:00:00Z'),
  ('m06', '2028-06-11T16:00:00Z'),
  ('m07', '2028-06-11T19:00:00Z'),
  ('m08', '2028-06-12T13:00:00Z'),
  ('m09', '2028-06-12T16:00:00Z'),
  ('m10', '2028-06-12T19:00:00Z'),
  ('m11', '2028-06-13T16:00:00Z'),
  ('m12', '2028-06-13T19:00:00Z'),
  ('m13', '2028-06-14T13:00:00Z'),
  ('m14', '2028-06-14T16:00:00Z'),
  ('m15', '2028-06-14T19:00:00Z'),
  ('m16', '2028-06-15T13:00:00Z'),
  ('m17', '2028-06-15T16:00:00Z'),
  ('m18', '2028-06-15T19:00:00Z'),
  ('m19', '2028-06-16T13:00:00Z'),
  ('m20', '2028-06-16T16:00:00Z'),
  ('m21', '2028-06-16T19:00:00Z'),
  ('m22', '2028-06-17T13:00:00Z'),
  ('m23', '2028-06-17T16:00:00Z'),
  ('m24', '2028-06-17T19:00:00Z'),
  ('m25', '2028-06-18T19:00:00Z'),
  ('m26', '2028-06-18T19:00:00Z'),
  ('m27', '2028-06-19T19:00:00Z'),
  ('m28', '2028-06-19T19:00:00Z'),
  ('m29', '2028-06-20T16:00:00Z'),
  ('m30', '2028-06-20T16:00:00Z'),
  ('m31', '2028-06-20T19:00:00Z'),
  ('m32', '2028-06-20T19:00:00Z'),
  ('m33', '2028-06-21T16:00:00Z'),
  ('m34', '2028-06-21T16:00:00Z'),
  ('m35', '2028-06-21T19:00:00Z'),
  ('m36', '2028-06-21T19:00:00Z'),
  ('m37', '2028-06-24T19:00:00Z'),
  ('m38', '2028-06-24T16:00:00Z'),
  ('m39', '2028-06-25T19:00:00Z'),
  ('m40', '2028-06-25T16:00:00Z'),
  ('m41', '2028-06-26T19:00:00Z'),
  ('m42', '2028-06-26T16:00:00Z'),
  ('m43', '2028-06-27T16:00:00Z'),
  ('m44', '2028-06-27T19:00:00Z'),
  ('m45', '2028-06-30T16:00:00Z'),
  ('m46', '2028-06-30T19:00:00Z'),
  ('m47', '2028-07-01T16:00:00Z'),
  ('m48', '2028-07-01T19:00:00Z'),
  ('m49', '2028-07-04T19:00:00Z'),
  ('m50', '2028-07-05T19:00:00Z'),
  ('m51', '2028-07-09T16:00:00Z')
on conflict (match_id) do update set kickoff_utc = excluded.kickoff_utc;

-- ---------- Hilfen ----------------------------------------------------------

create or replace function public.kt_tip_clean_name(p_name text) returns text
language plpgsql immutable as $$
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
language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from tip_groups where code = c);
  end loop;
  return c;
end;
$$;

create or replace function public.kt_tip_opener_started() returns boolean
language sql stable as $$
  select coalesce((select min(kickoff_utc) <= now() from kt_fixtures), false);
$$;

-- ---------- Runde erstellen / beitreten / verlassen -----------------------

create or replace function public.kt_tip_create(p_device uuid, p_group_name text, p_player text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  gname text := regexp_replace(trim(coalesce(p_group_name, '')), '\s+', ' ', 'g');
begin
  if char_length(gname) not between 2 and 40 then
    raise exception 'group name invalid';
  end if;
  if (select count(*) from tip_groups where owner_device = p_device) >= 5 then
    raise exception 'too many groups';
  end if;
  if (select count(*) from tip_members where device_id = p_device and not banned) >= 10 then
    raise exception 'too many memberships';
  end if;
  insert into tip_groups (code, name, owner_device)
  values (kt_tip_new_code(), gname, p_device)
  returning * into g;
  insert into tip_members (group_id, device_id, name)
  values (g.id, p_device, kt_tip_clean_name(p_player));
  return jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name);
end;
$$;

create or replace function public.kt_tip_join(p_device uuid, p_code text, p_player text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  m tip_members;
  pname text := kt_tip_clean_name(p_player);
begin
  select * into g from tip_groups where code = upper(trim(p_code));
  if not found then
    raise exception 'group not found';
  end if;
  select * into m from tip_members where group_id = g.id and device_id = p_device;
  if m.device_id is not null and m.banned then
    raise exception 'banned';
  end if;
  if exists (select 1 from tip_members where group_id = g.id and not banned
               and lower(name) = lower(pname) and device_id <> p_device) then
    raise exception 'name taken';
  end if;
  if m.device_id is not null then
    update tip_members set name = pname where group_id = g.id and device_id = p_device;
  else
    if (select count(*) from tip_members where group_id = g.id and not banned) >= 50 then
      raise exception 'group full';
    end if;
    if (select count(*) from tip_members where device_id = p_device and not banned) >= 10 then
      raise exception 'too many memberships';
    end if;
    insert into tip_members (group_id, device_id, name) values (g.id, p_device, pname);
  end if;
  return jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name);
end;
$$;

-- Verlassen: Verlässt der Ersteller, übernimmt das älteste Mitglied; ist
-- niemand mehr da, wird die Runde gelöscht.
create or replace function public.kt_tip_leave(p_device uuid, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  heir uuid;
begin
  select * into g from tip_groups where id = p_group;
  if not found then return; end if;
  delete from tip_members where group_id = p_group and device_id = p_device and not banned;
  if g.owner_device = p_device then
    select device_id into heir from tip_members
     where group_id = p_group and not banned order by joined_at limit 1;
    if heir is null then
      delete from tip_groups where id = p_group;
    else
      update tip_groups set owner_device = heir where id = p_group;
    end if;
  end if;
end;
$$;

create or replace function public.kt_tip_rename(p_device uuid, p_group uuid, p_player text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pname text := kt_tip_clean_name(p_player);
begin
  if exists (select 1 from tip_members where group_id = p_group and not banned
               and lower(name) = lower(pname) and device_id <> p_device) then
    raise exception 'name taken';
  end if;
  update tip_members set name = pname
   where group_id = p_group and device_id = p_device and not banned;
end;
$$;

-- ---------- Nur für den Ersteller -----------------------------------------

-- Rauswerfen: Das Mitglied bleibt gesperrt und kann nicht wieder beitreten.
create or replace function public.kt_tip_kick(p_device uuid, p_group uuid, p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tip_groups where id = p_group and owner_device = p_device) then
    raise exception 'not owner';
  end if;
  update tip_members set banned = true
   where group_id = p_group and member_id = p_member and device_id <> p_device;
end;
$$;

create or replace function public.kt_tip_delete(p_device uuid, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from tip_groups where id = p_group and owner_device = p_device;
end;
$$;

-- ---------- Lesen -----------------------------------------------------------

create or replace function public.kt_tip_my_groups(p_device uuid) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'code', g.code, 'name', g.name,
           'isOwner', g.owner_device = p_device,
           'members', (select count(*) from tip_members x where x.group_id = g.id and not x.banned)
         ) order by m.joined_at), '[]'::jsonb)
    from tip_members m join tip_groups g on g.id = m.group_id
   where m.device_id = p_device and not m.banned;
$$;

-- Tabelle einer Runde: Mitglieder, Tipps (fremde nur für angepfiffene Spiele)
-- und Europameister-Tipps (fremde erst ab dem Eröffnungsspiel).
create or replace function public.kt_tip_board(p_device uuid, p_group uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  started boolean := kt_tip_opener_started();
begin
  select * into g from tip_groups where id = p_group;
  if not found or not exists (
    select 1 from tip_members where group_id = p_group and device_id = p_device and not banned
  ) then
    raise exception 'not a member';
  end if;
  return jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name,
                                'isOwner', g.owner_device = p_device),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.member_id, 'name', m.name,
               'isOwner', m.device_id = g.owner_device,
               'isMe', m.device_id = p_device,
               'champion', case when started or m.device_id = p_device
                                then (select champion from tip_bonus b where b.device_id = m.device_id) end,
               'tips', (
                 select coalesce(jsonb_object_agg(t.match_id, jsonb_build_object('home', t.home, 'away', t.away)), '{}'::jsonb)
                   from tip_predictions t
                   join kt_fixtures f on f.match_id = t.match_id
                  where t.device_id = m.device_id
                    and (f.kickoff_utc <= now() or m.device_id = p_device)
               )
             ) order by m.joined_at), '[]'::jsonb)
        from tip_members m where m.group_id = p_group and not m.banned
    )
  );
end;
$$;

-- ---------- Tipps speichern -------------------------------------------------

-- Ersetzt die offenen Tipps dieses Geräts (Spiele vor Anpfiff). Bereits
-- angepfiffene Spiele bleiben unverändert – nachträgliches Ändern ist nicht
-- möglich. Nur für Geräte, die in mindestens einer Runde sind.
create or replace function public.kt_tip_save(p_device uuid, p_tips jsonb, p_champion text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  list jsonb := coalesce(p_tips, '[]'::jsonb);
begin
  if not exists (select 1 from tip_members where device_id = p_device and not banned) then
    return;
  end if;
  if jsonb_typeof(list) <> 'array' or jsonb_array_length(list) > 60 then
    raise exception 'invalid tips';
  end if;
  delete from tip_predictions t
   using kt_fixtures f
   where t.device_id = p_device and f.match_id = t.match_id and f.kickoff_utc > now()
     and t.match_id not in (select x->>'match_id' from jsonb_array_elements(list) x);
  insert into tip_predictions (device_id, match_id, home, away, updated_at)
  select distinct on (x->>'match_id')
         p_device, x->>'match_id',
         least(30, greatest(0, (x->>'home')::int)), least(30, greatest(0, (x->>'away')::int)), now()
    from jsonb_array_elements(list) x
    join kt_fixtures f on f.match_id = x->>'match_id'
   where f.kickoff_utc > now()
  on conflict (device_id, match_id) do update
    set home = excluded.home, away = excluded.away, updated_at = now();
  if not kt_tip_opener_started() then
    if p_champion is null then
      delete from tip_bonus where device_id = p_device;
    elsif p_champion ~ '^[A-Z]{3}$' then
      insert into tip_bonus (device_id, champion) values (p_device, p_champion)
      on conflict (device_id) do update set champion = excluded.champion, updated_at = now();
    end if;
  end if;
end;
$$;

-- ---------- Rechte ----------------------------------------------------------

revoke all on function public.kt_tip_create(uuid, text, text) from public;
revoke all on function public.kt_tip_join(uuid, text, text) from public;
revoke all on function public.kt_tip_leave(uuid, uuid) from public;
revoke all on function public.kt_tip_rename(uuid, uuid, text) from public;
revoke all on function public.kt_tip_kick(uuid, uuid, uuid) from public;
revoke all on function public.kt_tip_delete(uuid, uuid) from public;
revoke all on function public.kt_tip_my_groups(uuid) from public;
revoke all on function public.kt_tip_board(uuid, uuid) from public;
revoke all on function public.kt_tip_save(uuid, jsonb, text) from public;
grant execute on function public.kt_tip_create(uuid, text, text) to anon, authenticated;
grant execute on function public.kt_tip_join(uuid, text, text) to anon, authenticated;
grant execute on function public.kt_tip_leave(uuid, uuid) to anon, authenticated;
grant execute on function public.kt_tip_rename(uuid, uuid, text) to anon, authenticated;
grant execute on function public.kt_tip_kick(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.kt_tip_delete(uuid, uuid) to anon, authenticated;
grant execute on function public.kt_tip_my_groups(uuid) to anon, authenticated;
grant execute on function public.kt_tip_board(uuid, uuid) to anon, authenticated;
grant execute on function public.kt_tip_save(uuid, jsonb, text) to anon, authenticated;
