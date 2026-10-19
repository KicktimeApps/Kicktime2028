-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Push bei Beitrittsanfrage“
--
-- Fragt jemand an, einer Runde beizutreten, bekommt der Ersteller eine
-- Push-Benachrichtigung (sofern er Erinnerungen eingeschaltet hat). Ein Tipp
-- darauf öffnet direkt die Mitgliederverwaltung der Runde.
--
-- Die Nachrichten landen in einer Warteschlange, die die Edge Function
-- send-push-reminders jede Minute mit verschickt (Code dafür neu einfügen).
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261019180000_beitrittsanfragen.sql).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.tip_push_queue (
  id          bigserial primary key,
  device_id   uuid not null,
  title       text not null,
  body        text not null,
  url         text not null,
  tag         text not null,
  created_at  timestamptz not null default now()
);
alter table public.tip_push_queue enable row level security;
revoke all on public.tip_push_queue from anon, authenticated;

-- Beitreten = Anfrage stellen; neu: Ersteller per Push benachrichtigen.
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
    -- Nur wenn der Ersteller Push eingeschaltet hat; höchstens eine
    -- ungesendete Nachricht pro Runde (mehrere Anfragen → eine Meldung).
    if exists (select 1 from push_subscriptions where device_id = g.owner_device)
       and not exists (select 1 from tip_push_queue
                        where device_id = g.owner_device and tag = 'tip-req-' || g.id) then
      insert into tip_push_queue (device_id, title, body, url, tag)
      values (g.owner_device,
              'Neue Beitrittsanfrage',
              pname || ' möchte in „' || g.name || '“ mittippen. Tippe, um anzunehmen oder abzulehnen.',
              '/runde/' || g.code || '?verwaltung=1',
              'tip-req-' || g.id);
    end if;
  end if;
  return jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name,
                            'pending', not coalesce(m.approved, false));
end;
$$;

-- Für die Edge Function: offene Nachrichten holen und gleich entfernen
-- (atomar, damit nichts doppelt verschickt wird). Ältere als 1 Tag verfallen.
create or replace function public.kt_claim_tip_push()
returns table (device_id uuid, title text, body text, url text, tag text,
               endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  delete from tip_push_queue q where q.created_at < now() - interval '1 day';
  return query
    with taken as (
      delete from tip_push_queue q
       where q.id in (select id from tip_push_queue order by id limit 200)
      returning q.device_id, q.title, q.body, q.url, q.tag
    )
    select t.device_id, t.title, t.body, t.url, t.tag, s.endpoint, s.p256dh, s.auth
      from taken t join push_subscriptions s on s.device_id = t.device_id;
end;
$$;

-- Admin: alle Tipprunden löschen (Mitglieder, Tipps und Nachrichten fallen mit).
create or replace function public.kt_admin_delete_tip_groups() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from tip_push_queue where tag like 'tip-req-%';
  delete from tip_groups where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.kt_claim_tip_push() from public, anon, authenticated;
revoke all on function public.kt_admin_delete_tip_groups() from public, anon, authenticated;
grant execute on function public.kt_claim_tip_push() to service_role;
grant execute on function public.kt_admin_delete_tip_groups() to service_role;
grant execute on function public.kt_tip_join(uuid, text, text) to anon, authenticated;
