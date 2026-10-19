-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Push-Absicherung“
--
-- Beitrittsanfrage-Nachrichten werden erst beim Versand endgültig geprüft:
--  - nur an den aktuellen Ersteller der Runde (hat er die Runde inzwischen
--    abgegeben, geht die Nachricht an den neuen Ersteller),
--  - nur solange noch eine Anfrage offen ist (schon angenommen, abgelehnt
--    oder zurückgezogen → keine Nachricht),
--  - nie für gelöschte Runden.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261020090000_anfrage_push.sql).
-- ════════════════════════════════════════════════════════════════════════

alter table public.tip_push_queue add column if not exists group_id uuid;

-- Beitreten = Anfrage stellen; die Nachricht merkt sich die Runde (nicht das Gerät).
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
    -- Höchstens eine ungesendete Nachricht pro Runde (mehrere Anfragen → eine).
    if not exists (select 1 from tip_push_queue where group_id = g.id) then
      insert into tip_push_queue (device_id, group_id, title, body, url, tag)
      values (g.owner_device, g.id,
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

-- Versand: erst jetzt den Empfänger bestimmen – immer der aktuelle Ersteller,
-- nur bei noch offener Anfrage und nur mit eingeschaltetem Push.
create or replace function public.kt_claim_tip_push()
returns table (device_id uuid, title text, body text, url text, tag text,
               endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  delete from tip_push_queue q where q.created_at < now() - interval '1 day';
  return query
    with taken as (
      delete from tip_push_queue q
       where q.id in (select x.id from tip_push_queue x order by x.id limit 200)
      returning q.group_id, q.title, q.body, q.url, q.tag
    )
    select g.owner_device, t.title, t.body, t.url, t.tag, s.endpoint, s.p256dh, s.auth
      from taken t
      join tip_groups g on g.id = t.group_id
      join push_subscriptions s on s.device_id = g.owner_device
     where exists (select 1 from tip_members r
                    where r.group_id = g.id and not r.approved and not r.banned);
end;
$$;

-- Alte Einträge ohne Runde (aus dem ersten Update) verwerfen.
delete from public.tip_push_queue where group_id is null;

revoke all on function public.kt_claim_tip_push() from public, anon, authenticated;
grant execute on function public.kt_claim_tip_push() to service_role;
grant execute on function public.kt_tip_join(uuid, text, text) to anon, authenticated;
