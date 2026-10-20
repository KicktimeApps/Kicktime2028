-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Korrekturen Sperren & Anträge“
--
--  - Überall Gesperrte kommen über „in einer Runde entsperren“ nicht mehr
--    zurück in eine Runde; Anträge gelten dann für die Sperre überall.
--  - Name beim Zurückholen vergeben → „Name 2“, „Name 3“ … statt Fehler.
--  - Höchstens 3 Anträge gelten je Sperre (seit Beginn der Sperre bzw. dem
--    letzten angenommenen Antrag), nicht für alle Zeiten.
--  - Anträge gegen eine Sperre überall verschwinden nicht mehr, wenn die
--    Runde gelöscht wird, aus der heraus sie gestellt wurden.
--  - Eigener Antragsstand enthält den Code der Runde (für die Anzeige beim
--    Beitreten per Code).
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261022120000_entsperrt_hinweis.sql).
-- ════════════════════════════════════════════════════════════════════════

alter table public.tip_members add column if not exists banned_at timestamptz;

-- Runde gelöscht → Anträge bleiben (Runden-Anträge werden unten ausgeblendet).
alter table public.kt_unban_requests drop constraint if exists kt_unban_requests_group_id_fkey;
alter table public.kt_unban_requests
  add constraint kt_unban_requests_group_id_fkey foreign key (group_id)
  references public.tip_groups (id) on delete set null;

create or replace function public.kt_restore_member(p_group uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m tip_members;
  nm text;
  n int := 1;
begin
  select * into m from tip_members where group_id = p_group and member_id = p_member and banned;
  if m.device_id is null then return; end if;
  -- Überall gesperrt: in keiner Runde zurückholen.
  if exists (select 1 from kt_device_bans where device_id = m.device_id) then return; end if;
  -- Name inzwischen vergeben → „Name 2“, „Name 3“ … (bis einer frei ist)
  nm := m.name;
  while exists (select 1 from tip_members x
                 where x.group_id = p_group and not x.banned and lower(x.name) = lower(nm)
                   and x.member_id <> p_member) loop
    n := n + 1;
    nm := left(m.name, 20 - length(n::text) - 1) || ' ' || n;
  end loop;
  update tip_members set banned = false, banned_by = null, banned_at = null, name = nm
   where group_id = p_group and member_id = p_member;
  insert into tip_group_events (group_id, text) values (p_group, nm || ' ist wieder dabei.');
end;
$$;

create or replace function public.kt_admin_unban(p_group uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m tip_members;
  g tip_groups;
begin
  select * into m from tip_members where group_id = p_group and member_id = p_member and banned;
  if m.device_id is null then return; end if;
  if m.banned_by = 'global' then raise exception 'global'; end if;
  select * into g from tip_groups where id = p_group;
  if m.banned_by = 'admin' and exists (select 1 from kt_device_bans where device_id = m.device_id) then
    -- Runden-Sperre aufheben, die Sperre „überall“ gilt weiter.
    update tip_members set banned_by = 'global' where group_id = p_group and member_id = p_member;
  elsif m.banned_by = 'admin' then
    perform kt_restore_member(p_group, p_member);
    perform kt_push(m.device_id, 'Du bist entsperrt',
      'Das KickTime-Team hat deine Sperre in „' || g.name || '“ aufgehoben.',
      '/runde/' || g.code, 'unban-' || p_group);
  else
    delete from tip_members where group_id = p_group and member_id = p_member;
  end if;
  perform kt_close_requests(m.device_id, 'group', p_group, 'accepted', null);
end;
$$;

create or replace function public.kt_admin_remove_member(p_group uuid, p_member uuid, p_ban boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m tip_members;
  g tip_groups;
begin
  select * into m from tip_members where group_id = p_group and member_id = p_member;
  if m.device_id is null then raise exception 'not found'; end if;
  select * into g from tip_groups where id = p_group;
  if p_ban then
    update tip_members set banned = true, banned_by = 'admin', banned_at = now()
     where group_id = p_group and member_id = p_member;
    insert into tip_group_events (group_id, text)
    values (p_group, m.name || ' wurde vom KickTime-Team gesperrt.');
    if g.owner_device <> m.device_id then
      perform kt_push(g.owner_device, 'Mitglied gesperrt',
        m.name || ' wurde vom KickTime-Team aus „' || g.name || '“ gesperrt.',
        '/runde/' || g.code || '?verwaltung=1', 'teamban-' || p_group);
    end if;
  else
    delete from tip_predictions where group_id = p_group and device_id = m.device_id;
    delete from tip_bonus where group_id = p_group and device_id = m.device_id;
    delete from tip_members where group_id = p_group and member_id = p_member;
  end if;
  perform kt_pass_ownership(p_group, m.device_id);
end;
$$;

create or replace function public.kt_admin_ban_global(p_device uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  lbl text;
  n int := 0;
begin
  select string_agg(m.name || ' (' || g.name || ')', ', ') into lbl
    from tip_members m join tip_groups g on g.id = m.group_id where m.device_id = p_device;
  insert into kt_device_bans (device_id, label, reason)
  values (p_device, left(coalesce(lbl, 'ohne Runde'), 300), left(nullif(trim(p_reason), ''), 300))
  on conflict (device_id) do update set reason = excluded.reason;
  -- Offene Beitrittsanfragen verfallen.
  delete from tip_members where device_id = p_device and not approved and not banned;
  for r in
    select m.group_id, m.name, g.name as gname, g.owner_device, g.code
      from tip_members m join tip_groups g on g.id = m.group_id
     where m.device_id = p_device and not m.banned
  loop
    update tip_members set banned = true, banned_by = 'global', banned_at = now()
     where group_id = r.group_id and device_id = p_device;
    insert into tip_group_events (group_id, text)
    values (r.group_id, r.name || ' wurde vom KickTime-Team gesperrt.');
    if r.owner_device <> p_device then
      perform kt_push(r.owner_device, 'Mitglied gesperrt',
        r.name || ' wurde vom KickTime-Team aus „' || r.gname || '“ gesperrt.',
        '/runde/' || r.code || '?verwaltung=1', 'teamban-' || r.group_id);
    end if;
    perform kt_pass_ownership(r.group_id, p_device);
    n := n + 1;
  end loop;
  -- Offene Anträge zu einzelnen Runden sind damit hinfällig.
  update kt_unban_requests set status = 'rejected', decided_at = now(),
         reply = 'Inzwischen für alle Tipprunden gesperrt.'
   where target_device = p_device and status = 'open' and scope = 'group';
  return n;
end;
$$;

create or replace function public.kt_tip_remove(p_device uuid, p_group uuid, p_member uuid, p_ban boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  dev uuid;
begin
  if not exists (select 1 from tip_groups where id = p_group and owner_device = p_device) then
    raise exception 'not owner';
  end if;
  select device_id into dev from tip_members
   where group_id = p_group and member_id = p_member and device_id <> p_device and not banned;
  if dev is null then return; end if;
  delete from tip_predictions where group_id = p_group and device_id = dev;
  delete from tip_bonus where group_id = p_group and device_id = dev;
  if p_ban then
    update tip_members set banned = true, banned_by = 'owner', banned_at = now()
     where group_id = p_group and member_id = p_member;
  else
    delete from tip_members where group_id = p_group and member_id = p_member;
  end if;
end;
$$;

create or replace function public.kt_unban_request(
  p_device uuid, p_group uuid, p_code text, p_member uuid, p_message text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  target uuid;
  tname text;
  by_ text;
  v_scope text;
  v_handler text;
  cnt int;
  last_reject timestamptz;
  since timestamptz;
  msg text := left(nullif(trim(p_message), ''), 300);
begin
  if p_group is not null then
    select * into g from tip_groups where id = p_group;
  elsif p_code is not null then
    select * into g from tip_groups where code = upper(trim(p_code));
  end if;

  if p_member is not null then
    -- Ersteller bittet für ein Mitglied
    if g.id is null or g.owner_device <> p_device then raise exception 'not owner'; end if;
    select device_id, name, banned_by into target, tname, by_ from tip_members
     where group_id = g.id and member_id = p_member and banned;
    if target is null or by_ not in ('admin', 'global') then raise exception 'not banned'; end if;
    v_scope := case
      when by_ = 'global' or exists (select 1 from kt_device_bans where device_id = target)
        then 'global' else 'group' end;
    v_handler := 'team';
  else
    target := p_device;
    if g.id is not null then
      select name, banned_by into tname, by_ from tip_members
       where group_id = g.id and device_id = target and banned;
    end if;
    if exists (select 1 from kt_device_bans where device_id = target) then
      v_scope := 'global'; v_handler := 'team';
    elsif by_ = 'admin' then
      v_scope := 'group'; v_handler := 'team';
    elsif by_ in ('owner') or (by_ is null and tname is not null) then
      v_scope := 'group'; v_handler := 'owner';
    elsif exists (select 1 from kt_device_bans where device_id = target) then
      v_scope := 'global'; v_handler := 'team';
    else
      raise exception 'not banned';
    end if;
  end if;

  -- Begrenzung je Sperre und Antragsteller
  if exists (select 1 from kt_unban_requests r
              where r.target_device = target and r.requester_device = p_device
                and r.scope = v_scope and r.status = 'open'
                and (v_scope = 'global' or r.group_id = g.id)) then
    raise exception 'request open';
  end if;
  -- Beginn dieser Sperre: frühere Sperren (und ihre Anträge) zählen nicht mit.
  if v_scope = 'global' then
    select created_at into since from kt_device_bans where device_id = target;
  else
    select banned_at into since from tip_members where group_id = g.id and device_id = target;
  end if;
  select greatest(coalesce(since, '-infinity'::timestamptz),
                  coalesce(max(r.decided_at) filter (where r.status = 'accepted'), '-infinity'))
    into since
    from kt_unban_requests r
   where r.target_device = target and r.requester_device = p_device and r.scope = v_scope
     and (v_scope = 'global' or r.group_id = g.id);
  select count(*), max(decided_at) filter (where status = 'rejected')
    into cnt, last_reject
    from kt_unban_requests r
   where r.target_device = target and r.requester_device = p_device and r.scope = v_scope
     and (v_scope = 'global' or r.group_id = g.id)
     and r.created_at >= since;
  if cnt >= 3 then raise exception 'request limit'; end if;
  if last_reject > now() - interval '7 days' then raise exception 'request cooldown'; end if;

  insert into kt_unban_requests (scope, group_id, target_device, requester_device, handler, message)
  values (v_scope, g.id, target, p_device, v_handler, msg);
  if tname is null then
    select split_part(label, ' (', 1) into tname from kt_device_bans where device_id = target;
  end if;

  if v_handler = 'team' then
    perform kt_push_team('Neuer Entsperrungsantrag',
      coalesce(tname, 'Jemand') ||
      case when v_scope = 'global' then ' (überall gesperrt)' else ' · „' || g.name || '“' end ||
      case when p_member is not null then ' – beantragt vom Ersteller' else '' end,
      '/einstellungen', 'unban-req');
  else
    perform kt_push(g.owner_device, 'Bitte um Entsperrung',
      coalesce(tname, 'Jemand') || ' möchte wieder in „' || g.name || '“.',
      '/runde/' || g.code || '?verwaltung=1', 'unban-req-' || g.id);
  end if;
  return jsonb_build_object('scope', v_scope, 'handler', v_handler);
end;
$$;

create or replace function public.kt_my_ban_status(p_device uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'global', exists (select 1 from kt_device_bans where device_id = p_device),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'scope', r.scope, 'groupId', r.group_id,
               'groupName', g.name,
               -- Code nur für eigene Anträge (man kannte ihn ja schon)
               'groupCode', case when r.target_device = p_device then g.code end,
               'forMember', r.target_device <> p_device,
               'memberId', case when r.target_device <> p_device then
                             (select m.member_id from tip_members m
                               where m.group_id = r.group_id and m.device_id = r.target_device)
                           end,
               'handler', r.handler, 'status', r.status, 'reply', r.reply,
               'createdAt', r.created_at, 'decidedAt', r.decided_at) order by r.created_at)
        from kt_unban_requests r left join tip_groups g on g.id = r.group_id
       where r.requester_device = p_device and r.created_at > now() - interval '90 days'
         and not (r.scope = 'group' and r.group_id is null)
    ), '[]'::jsonb)
  );
$$;

create or replace function public.kt_admin_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'scope', r.scope, 'status', r.status,
           'groupId', r.group_id, 'groupName', g.name,
           'name', coalesce(
             (select m.name from tip_members m
               where m.group_id = r.group_id and m.device_id = r.target_device),
             (select b.label from kt_device_bans b where b.device_id = r.target_device)),
           'byOwner', r.requester_device <> r.target_device,
           'message', r.message, 'reply', r.reply,
           'createdAt', r.created_at, 'decidedAt', r.decided_at,
           'banReason', (select b.reason from kt_device_bans b where b.device_id = r.target_device))
         order by (r.status = 'open') desc, r.created_at desc), '[]'::jsonb)
    from kt_unban_requests r left join tip_groups g on g.id = r.group_id
   where r.handler = 'team'
     and not (r.scope = 'group' and r.group_id is null)
     and (r.status = 'open' or r.decided_at > now() - interval '30 days');
$$;

-- Rechte wie bisher
revoke all on function public.kt_restore_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kt_admin_unban(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kt_admin_remove_member(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.kt_admin_ban_global(uuid, text) from public, anon, authenticated;
revoke all on function public.kt_admin_requests() from public, anon, authenticated;
grant execute on function public.kt_restore_member(uuid, uuid) to service_role;
grant execute on function public.kt_admin_unban(uuid, uuid) to service_role;
grant execute on function public.kt_admin_remove_member(uuid, uuid, boolean) to service_role;
grant execute on function public.kt_admin_ban_global(uuid, text) to service_role;
grant execute on function public.kt_admin_requests() to service_role;
revoke all on function public.kt_tip_remove(uuid, uuid, uuid, boolean) from public;
revoke all on function public.kt_unban_request(uuid, uuid, text, uuid, text) from public;
revoke all on function public.kt_my_ban_status(uuid) from public;
grant execute on function public.kt_tip_remove(uuid, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.kt_unban_request(uuid, uuid, text, uuid, text) to anon, authenticated;
grant execute on function public.kt_my_ban_status(uuid) to anon, authenticated;

-- Versand: mit Zeitpunkt, damit erneut eingereihte Nachrichten nach einem Tag
-- trotzdem verfallen (statt bei jedem Fehler wieder „neu“ zu sein).
drop function if exists public.kt_claim_direct_push();
create function public.kt_claim_direct_push()
returns table (device_id uuid, title text, body text, url text, tag text,
               endpoint text, p256dh text, auth text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  delete from kt_push_queue q where q.created_at < now() - interval '1 day';
  return query
    with taken as (
      delete from kt_push_queue q
       where q.id in (select x.id from kt_push_queue x order by x.id limit 200)
      returning q.device_id, q.title, q.body, q.url, q.tag, q.created_at
    )
    select t.device_id, t.title, t.body, t.url, t.tag, s.endpoint, s.p256dh, s.auth, t.created_at
      from taken t join push_subscriptions s on s.device_id = t.device_id;
end;
$$;
revoke all on function public.kt_claim_direct_push() from public, anon, authenticated;
grant execute on function public.kt_claim_direct_push() to service_role;
