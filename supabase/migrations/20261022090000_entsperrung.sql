-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Sperren & Entsperrungsanträge“
--
--  - Sperre durch das KickTime-Team: in einer Runde oder überall (für alle
--    Tipprunden: kein Beitreten, kein Erstellen). Tipps bleiben erhalten und
--    kommen beim Entsperren zurück.
--  - Wer überall gesperrt wird und Runden leitet: das älteste Mitglied
--    übernimmt (allein → Runde gelöscht). Die Runde zeigt einen Hinweis.
--  - Entsperrungsanträge: vom Gesperrten selbst oder vom Ersteller der Runde.
--    Team-Sperren entscheidet das Team, Ersteller-Sperren der Ersteller.
--    Je Sperre: ein offener Antrag, nach Ablehnung 7 Tage Pause, höchstens 3.
--  - Mitteilungen über neue Anträge nur an ausdrücklich eingetragene
--    Team-Geräte (app_config „admin_devices“, nur über die PIN änderbar).
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261021150000_kicken_sperren.sql).
-- Danach die Edge Functions `admin` und `send-push-reminders` neu deployen.
-- ════════════════════════════════════════════════════════════════════════

-- ---------- Tabellen ------------------------------------------------------

create table if not exists public.kt_device_bans (
  device_id   uuid primary key,
  label       text not null default '',
  reason      text check (char_length(reason) <= 300),
  created_at  timestamptz not null default now()
);

create table if not exists public.tip_group_events (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.tip_groups (id) on delete cascade,
  text        text not null check (char_length(text) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists tip_group_events_group_idx on public.tip_group_events (group_id, created_at);

-- Mitteilungen an genau ein Gerät (versendet von send-push-reminders).
create table if not exists public.kt_push_queue (
  id          bigint generated always as identity primary key,
  device_id   uuid not null,
  title       text not null,
  body        text not null,
  url         text not null default '/',
  tag         text,
  created_at  timestamptz not null default now()
);

create table if not exists public.kt_unban_requests (
  id                bigint generated always as identity primary key,
  scope             text not null check (scope in ('group', 'global')),
  group_id          uuid references public.tip_groups (id) on delete cascade,
  target_device     uuid not null,
  requester_device  uuid not null,
  handler           text not null check (handler in ('team', 'owner')),
  message           text check (char_length(message) <= 300),
  status            text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  reply             text check (char_length(reply) <= 300),
  created_at        timestamptz not null default now(),
  decided_at        timestamptz
);
create index if not exists kt_unban_requests_target_idx on public.kt_unban_requests (target_device);
create index if not exists kt_unban_requests_open_idx on public.kt_unban_requests (status) where status = 'open';

alter table public.kt_device_bans    enable row level security;
alter table public.tip_group_events  enable row level security;
alter table public.kt_push_queue     enable row level security;
alter table public.kt_unban_requests enable row level security;
revoke all on public.kt_device_bans, public.tip_group_events, public.kt_push_queue,
  public.kt_unban_requests from anon, authenticated;

alter table public.tip_members drop constraint if exists tip_members_banned_by_check;
alter table public.tip_members
  add constraint tip_members_banned_by_check check (banned_by in ('owner', 'admin', 'global'));

-- ---------- Überall gesperrt: weder beitreten noch erstellen --------------

create or replace function public.kt_block_banned_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from kt_device_bans where device_id = new.device_id) then
    raise exception 'globally banned';
  end if;
  return new;
end;
$$;

create or replace function public.kt_block_banned_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from kt_device_bans where device_id = new.owner_device) then
    raise exception 'globally banned';
  end if;
  return new;
end;
$$;

drop trigger if exists kt_block_banned_member on public.tip_members;
create trigger kt_block_banned_member before insert on public.tip_members
  for each row execute function public.kt_block_banned_member();
drop trigger if exists kt_block_banned_owner on public.tip_groups;
create trigger kt_block_banned_owner before insert on public.tip_groups
  for each row execute function public.kt_block_banned_owner();

-- ---------- Helfer --------------------------------------------------------

create or replace function public.kt_push(p_device uuid, p_title text, p_body text, p_url text, p_tag text)
returns void
language sql security definer set search_path = public as $$
  insert into kt_push_queue (device_id, title, body, url, tag)
  values (p_device, left(p_title, 80), left(p_body, 200), coalesce(p_url, '/'), p_tag);
$$;

-- Nur an die mit PIN eingetragenen Team-Geräte.
create or replace function public.kt_push_team(p_title text, p_body text, p_url text, p_tag text)
returns void
language sql security definer set search_path = public as $$
  insert into kt_push_queue (device_id, title, body, url, tag)
  select d::uuid, left(p_title, 80), left(p_body, 200), p_url, p_tag
    from app_config c, jsonb_array_elements_text(coalesce(c.value -> 'devices', '[]'::jsonb)) d
   where c.key = 'admin_devices';
$$;

-- Gesperrtes Mitglied zurückholen (Name schon vergeben → „Name 2“).
create or replace function public.kt_restore_member(p_group uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m tip_members;
  nm text;
begin
  select * into m from tip_members where group_id = p_group and member_id = p_member and banned;
  if m.device_id is null then return; end if;
  nm := m.name;
  if exists (select 1 from tip_members x
              where x.group_id = p_group and not x.banned and lower(x.name) = lower(nm)
                and x.member_id <> p_member) then
    nm := left(m.name, 17) || ' 2';
  end if;
  update tip_members set banned = false, banned_by = null, name = nm
   where group_id = p_group and member_id = p_member;
  insert into tip_group_events (group_id, text) values (p_group, nm || ' ist wieder dabei.');
end;
$$;

-- Ersteller weg → ältestes Mitglied übernimmt, sonst Runde löschen.
create or replace function public.kt_pass_ownership(p_group uuid, p_gone uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g tip_groups;
  heir uuid;
  heir_name text;
begin
  select * into g from tip_groups where id = p_group;
  if g.owner_device is distinct from p_gone then return; end if;
  select device_id, name into heir, heir_name from tip_members
   where group_id = p_group and not banned and approved and device_id <> p_gone
   order by joined_at limit 1;
  if heir is null then
    delete from tip_groups where id = p_group;
  else
    update tip_groups set owner_device = heir where id = p_group;
    insert into tip_group_events (group_id, text)
    values (p_group, heir_name || ' leitet die Runde jetzt.');
    perform kt_push(heir, 'Du leitest jetzt „' || g.name || '“',
      'Der bisherige Ersteller ist nicht mehr dabei. Du kannst jetzt Anfragen annehmen und Mitglieder verwalten.',
      '/runde/' || g.code, 'owner-' || p_group);
  end if;
end;
$$;

-- ---------- Sperren durch das Team ----------------------------------------

-- In einer Runde (Tipps bleiben für ein späteres Entsperren erhalten).
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
    update tip_members set banned = true, banned_by = 'admin'
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

-- Überall.
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
    update tip_members set banned = true, banned_by = 'global'
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

create or replace function public.kt_admin_unban_global(p_device uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  delete from kt_device_bans where device_id = p_device;
  for r in select group_id, member_id from tip_members
            where device_id = p_device and banned and banned_by = 'global'
  loop
    perform kt_restore_member(r.group_id, r.member_id);
    n := n + 1;
  end loop;
  perform kt_close_requests(p_device, 'global', null, 'accepted', null);
  perform kt_push(p_device, 'Du bist entsperrt',
    'Das KickTime-Team hat deine Sperre aufgehoben. Du kannst wieder bei Tipprunden mitmachen.',
    '/tipps', 'unban-global');
  return n;
end;
$$;

-- Entsperren in einer Runde: Team-Sperre → zurückholen, Ersteller-Sperre → Eintrag weg.
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
  if m.banned_by = 'admin' then
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

-- ---------- Anträge -------------------------------------------------------

create or replace function public.kt_close_requests(
  p_target uuid, p_scope text, p_group uuid, p_status text, p_reply text
) returns void
language sql security definer set search_path = public as $$
  update kt_unban_requests
     set status = p_status, decided_at = now(), reply = left(p_reply, 300)
   where target_device = p_target and status = 'open' and scope = p_scope
     and (p_scope = 'global' or group_id = p_group);
$$;

/**
 * Antrag stellen.
 *  - selbst (p_member null): für eine Runde (p_group oder p_code) oder überall
 *  - als Ersteller für ein vom Team gesperrtes Mitglied (p_member)
 */
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
    v_scope := case when by_ = 'global' then 'global' else 'group' end;
    v_handler := 'team';
  else
    target := p_device;
    if g.id is not null then
      select name, banned_by into tname, by_ from tip_members
       where group_id = g.id and device_id = target and banned;
    end if;
    if by_ = 'admin' then
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
  select count(*), max(decided_at) filter (where status = 'rejected')
    into cnt, last_reject
    from kt_unban_requests r
   where r.target_device = target and r.requester_device = p_device and r.scope = v_scope
     and (v_scope = 'global' or r.group_id = g.id);
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

-- Eigener Stand: überall gesperrt? Und alle eigenen Anträge (90 Tage).
create or replace function public.kt_my_ban_status(p_device uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'global', exists (select 1 from kt_device_bans where device_id = p_device),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'scope', r.scope, 'groupId', r.group_id,
               'groupName', g.name, 'forMember', r.target_device <> p_device,
               'memberId', case when r.target_device <> p_device then
                             (select m.member_id from tip_members m
                               where m.group_id = r.group_id and m.device_id = r.target_device)
                           end,
               'handler', r.handler, 'status', r.status, 'reply', r.reply,
               'createdAt', r.created_at, 'decidedAt', r.decided_at) order by r.created_at)
        from kt_unban_requests r left join tip_groups g on g.id = r.group_id
       where r.requester_device = p_device and r.created_at > now() - interval '90 days'
    ), '[]'::jsonb)
  );
$$;

-- Hinweise einer Runde (letzte 14 Tage) – nur für Mitglieder.
create or replace function public.kt_tip_events(p_device uuid, p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform kt_tip_require_approved(p_device, p_group);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'text', e.text, 'at', e.created_at)
                     order by e.created_at desc)
      from tip_group_events e
     where e.group_id = p_group and e.created_at > now() - interval '14 days'
  ), '[]'::jsonb);
end;
$$;

-- Gesperrte einer Runde für den Ersteller – mit Art der Sperre und offenen Anträgen.
create or replace function public.kt_tip_banned(p_device uuid, p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from tip_groups where id = p_group and owner_device = p_device) then
    raise exception 'not owner';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.member_id, 'name', m.name, 'by', coalesce(m.banned_by, 'owner'),
             -- offene Bitte des Gesperrten an den Ersteller
             'request', (select jsonb_build_object('message', r.message, 'at', r.created_at)
                           from kt_unban_requests r
                          where r.group_id = p_group and r.target_device = m.device_id
                            and r.handler = 'owner' and r.status = 'open'
                          order by r.created_at desc limit 1))
           order by m.name)
      from tip_members m
     where m.group_id = p_group and m.banned
  ), '[]'::jsonb);
end;
$$;

-- Ersteller entsperrt (nur eigene Sperren) – offene Bitte gilt als angenommen.
create or replace function public.kt_tip_unban(p_device uuid, p_group uuid, p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m tip_members;
  g tip_groups;
begin
  select * into g from tip_groups where id = p_group and owner_device = p_device;
  if g.id is null then raise exception 'not owner'; end if;
  select * into m from tip_members
   where group_id = p_group and member_id = p_member and banned
     and coalesce(banned_by, 'owner') = 'owner';
  if m.device_id is null then return; end if;
  delete from tip_members where group_id = p_group and member_id = p_member;
  perform kt_close_requests(m.device_id, 'group', p_group, 'accepted', null);
  perform kt_push(m.device_id, 'Du bist entsperrt',
    'Du kannst „' || g.name || '“ mit dem Code wieder anfragen.', '/tipps', 'unban-' || p_group);
end;
$$;

-- Ersteller lehnt die Bitte eines Gesperrten ab.
create or replace function public.kt_tip_reject_unban(p_device uuid, p_group uuid, p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  dev uuid;
begin
  if not exists (select 1 from tip_groups where id = p_group and owner_device = p_device) then
    raise exception 'not owner';
  end if;
  select device_id into dev from tip_members where group_id = p_group and member_id = p_member;
  update kt_unban_requests set status = 'rejected', decided_at = now()
   where group_id = p_group and target_device = dev and handler = 'owner' and status = 'open';
end;
$$;

-- ---------- Team: Anträge entscheiden, Übersichten ------------------------

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
     and (r.status = 'open' or r.decided_at > now() - interval '30 days');
$$;

create or replace function public.kt_admin_decide(p_id bigint, p_accept boolean, p_reply text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r kt_unban_requests;
  mid uuid;
  gname text;
begin
  select * into r from kt_unban_requests where id = p_id and handler = 'team' and status = 'open';
  if r.id is null then raise exception 'not found'; end if;
  select name into gname from tip_groups where id = r.group_id;
  if p_accept then
    if r.scope = 'global' then
      perform kt_admin_unban_global(r.target_device);
    else
      select member_id into mid from tip_members
       where group_id = r.group_id and device_id = r.target_device and banned;
      if mid is not null then perform kt_admin_unban(r.group_id, mid); end if;
    end if;
    update kt_unban_requests set status = 'accepted', decided_at = now(), reply = left(p_reply, 300)
     where id = p_id;
    if r.requester_device <> r.target_device then
      perform kt_push(r.requester_device, 'Antrag angenommen',
        'Das KickTime-Team hat die Sperre aufgehoben.', '/tipps', 'unban-req-done');
    end if;
  else
    update kt_unban_requests set status = 'rejected', decided_at = now(), reply = left(p_reply, 300)
     where id = p_id;
    perform kt_push(r.requester_device, 'Antrag abgelehnt',
      coalesce(nullif(left(p_reply, 150), ''), 'Das KickTime-Team hat deinen Antrag abgelehnt.'),
      '/tipps', 'unban-req-done');
  end if;
end;
$$;

create or replace function public.kt_admin_global_bans() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'device', b.device_id, 'label', b.label, 'reason', b.reason, 'createdAt', b.created_at,
           'openRequests', (select count(*) from kt_unban_requests r
                             where r.target_device = b.device_id and r.status = 'open'))
         order by b.created_at desc), '[]'::jsonb)
    from kt_device_bans b;
$$;

-- Mitgliederliste im Team-Bereich, jetzt mit Art der Sperre.
create or replace function public.kt_admin_group(p_group uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'memberId', m.member_id,
           'name', m.name,
           'owner', m.device_id = g.owner_device,
           'approved', m.approved,
           'banned', m.banned,
           'bannedBy', m.banned_by,
           'joinedAt', m.joined_at,
           'tips', (select count(*) from tip_predictions p
                     where p.group_id = m.group_id and p.device_id = m.device_id),
           'champion', (select b.champion from tip_bonus b
                         where b.group_id = m.group_id and b.device_id = m.device_id)
         ) order by m.banned, not m.approved, m.joined_at), '[]'::jsonb)
    from tip_members m join tip_groups g on g.id = m.group_id
   where m.group_id = p_group;
$$;

-- Gerät hinter einem Mitglied (für „überall sperren“ aus der Mitgliederliste).
create or replace function public.kt_admin_member_device(p_group uuid, p_member uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select device_id from tip_members where group_id = p_group and member_id = p_member;
$$;

-- Versand der Einzel-Mitteilungen (send-push-reminders).
create or replace function public.kt_claim_direct_push()
returns table (device_id uuid, title text, body text, url text, tag text,
               endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  delete from kt_push_queue q where q.created_at < now() - interval '1 day';
  return query
    with taken as (
      delete from kt_push_queue q
       where q.id in (select x.id from kt_push_queue x order by x.id limit 200)
      returning q.device_id, q.title, q.body, q.url, q.tag
    )
    select t.device_id, t.title, t.body, t.url, t.tag, s.endpoint, s.p256dh, s.auth
      from taken t join push_subscriptions s on s.device_id = t.device_id;
end;
$$;

-- ---------- Rechte --------------------------------------------------------

do $$
declare
  f text;
begin
  -- nur Server (Edge Functions)
  foreach f in array array[
    'kt_push(uuid, text, text, text, text)', 'kt_push_team(text, text, text, text)',
    'kt_restore_member(uuid, uuid)', 'kt_pass_ownership(uuid, uuid)',
    'kt_close_requests(uuid, text, uuid, text, text)',
    'kt_admin_remove_member(uuid, uuid, boolean)', 'kt_admin_ban_global(uuid, text)',
    'kt_admin_unban_global(uuid)', 'kt_admin_unban(uuid, uuid)', 'kt_admin_requests()',
    'kt_admin_decide(bigint, boolean, text)', 'kt_admin_global_bans()', 'kt_admin_group(uuid)',
    'kt_admin_member_device(uuid, uuid)', 'kt_claim_direct_push()',
    'kt_block_banned_member()', 'kt_block_banned_owner()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- aus der App
  foreach f in array array[
    'kt_unban_request(uuid, uuid, text, uuid, text)', 'kt_my_ban_status(uuid)',
    'kt_tip_events(uuid, uuid)', 'kt_tip_banned(uuid, uuid)', 'kt_tip_unban(uuid, uuid, uuid)',
    'kt_tip_reject_unban(uuid, uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end;
$$;
