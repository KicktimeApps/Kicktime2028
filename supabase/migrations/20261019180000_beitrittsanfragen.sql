-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Beitrittsanfragen“
--
-- Wer mit Code beitritt, stellt eine Anfrage. Erst wenn der Ersteller der
-- Runde annimmt, erscheint man in der Tabelle und kann tippen. Ablehnen
-- entfernt die Anfrage (man kann es später erneut versuchen); Rauswerfen
-- sperrt wie bisher dauerhaft.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261019120000_tipps_pro_runde.sql).
-- Bisherige Mitglieder bleiben Mitglieder.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tip_members add column if not exists approved boolean not null default true;

-- Nur angenommene Mitglieder dürfen tippen und die Tabelle sehen.
create or replace function public.kt_tip_require_approved(p_device uuid, p_group uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  ok boolean;
begin
  select approved into ok from tip_members
   where group_id = p_group and device_id = p_device and not banned;
  if ok is null then
    raise exception 'not a member';
  end if;
  if not ok then
    raise exception 'pending';
  end if;
end;
$$;

-- ---------- Beitreten = Anfrage stellen ------------------------------------

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
    insert into tip_members (group_id, device_id, name, approved)
    values (g.id, p_device, pname, false);
  end if;
  return jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name,
                            'pending', not coalesce(m.approved, false));
end;
$$;

-- ---------- Annehmen / Ablehnen (nur Ersteller) ---------------------------

create or replace function public.kt_tip_answer(
  p_device uuid, p_group uuid, p_member uuid, p_accept boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  dev uuid;
begin
  if not exists (select 1 from tip_groups where id = p_group and owner_device = p_device) then
    raise exception 'not owner';
  end if;
  select device_id into dev from tip_members
   where group_id = p_group and member_id = p_member and not approved and not banned;
  if dev is null then
    return; -- schon beantwortet oder zurückgezogen
  end if;
  if p_accept then
    update tip_members set approved = true where group_id = p_group and device_id = dev;
  else
    delete from tip_members where group_id = p_group and device_id = dev;
    delete from tip_predictions where group_id = p_group and device_id = dev;
    delete from tip_bonus where group_id = p_group and device_id = dev;
  end if;
end;
$$;

-- ---------- Verlassen / Anfrage zurückziehen ------------------------------

create or replace function public.kt_tip_leave(p_device uuid, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  heir uuid;
begin
  select * into g from tip_groups where id = p_group;
  if not found then return; end if;
  delete from tip_members where group_id = p_group and device_id = p_device and not banned;
  delete from tip_predictions where group_id = p_group and device_id = p_device;
  delete from tip_bonus where group_id = p_group and device_id = p_device;
  if g.owner_device = p_device then
    select device_id into heir from tip_members
     where group_id = p_group and not banned and approved order by joined_at limit 1;
    if heir is null then
      delete from tip_groups where id = p_group;
    else
      update tip_groups set owner_device = heir where id = p_group;
    end if;
  end if;
end;
$$;

-- ---------- Tippen nur nach Annahme ---------------------------------------

create or replace function public.kt_tip_set(
  p_device uuid, p_group uuid, p_match text, p_home int, p_away int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  k timestamptz;
begin
  perform kt_tip_require_approved(p_device, p_group);
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
  perform kt_tip_require_approved(p_device, p_group);
  if exists (select 1 from kt_fixtures where match_id = p_match and kickoff_utc <= now()) then
    raise exception 'match started';
  end if;
  delete from tip_predictions
   where group_id = p_group and device_id = p_device and match_id = p_match;
end;
$$;

-- kt_tip_import und kt_tip_set_champion bleiben auch während der Anfrage
-- möglich: So kommen die bisherigen Tipps gleich beim Beitreten mit und
-- zählen ab der Annahme. Wird abgelehnt, werden sie gelöscht.

-- ---------- Lesen -----------------------------------------------------------

create or replace function public.kt_tip_my_groups(p_device uuid) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'code', g.code, 'name', g.name,
           'isOwner', g.owner_device = p_device,
           'pending', not m.approved,
           'members', (select count(*) from tip_members x
                        where x.group_id = g.id and not x.banned and x.approved),
           'requests', case when g.owner_device = p_device then
                         (select count(*) from tip_members x
                           where x.group_id = g.id and not x.banned and not x.approved)
                       else 0 end
         ) order by m.joined_at), '[]'::jsonb)
    from tip_members m join tip_groups g on g.id = m.group_id
   where m.device_id = p_device and not m.banned;
$$;

create or replace function public.kt_tip_board(p_device uuid, p_group uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  started boolean := kt_tip_opener_started();
begin
  perform kt_tip_require_approved(p_device, p_group);
  select * into g from tip_groups where id = p_group;
  return jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name,
                                'isOwner', g.owner_device = p_device),
    'requests', case when g.owner_device = p_device then (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.member_id, 'name', r.name)
                                order by r.joined_at), '[]'::jsonb)
        from tip_members r where r.group_id = p_group and not r.banned and not r.approved
    ) else '[]'::jsonb end,
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
        from tip_members m where m.group_id = p_group and not m.banned and m.approved
    )
  );
end;
$$;

-- ---------- Rechte ----------------------------------------------------------

revoke all on function public.kt_tip_require_approved(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kt_tip_answer(uuid, uuid, uuid, boolean) from public;
grant execute on function public.kt_tip_answer(uuid, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.kt_tip_join(uuid, text, text) to anon, authenticated;
grant execute on function public.kt_tip_leave(uuid, uuid) to anon, authenticated;
grant execute on function public.kt_tip_set(uuid, uuid, text, int, int) to anon, authenticated;
grant execute on function public.kt_tip_clear(uuid, uuid, text) to anon, authenticated;
grant execute on function public.kt_tip_my_groups(uuid) to anon, authenticated;
grant execute on function public.kt_tip_board(uuid, uuid) to anon, authenticated;
