-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Entfernen oder Sperren“
--
-- Der Ersteller einer Tipprunde hat beim Rauswerfen die Wahl:
--  - Entfernen: Tipps weg, mit dem Code kann man wieder anfragen.
--  - Sperren:   kommt nicht wieder rein – bis der Ersteller entsperrt.
-- Sperren durch den Betreiber (Admin-Bereich) kann der Ersteller nicht aufheben.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261021120000_sperre_hinweis.sql).
-- ════════════════════════════════════════════════════════════════════════

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
    update tip_members set banned = true, banned_by = 'owner'
     where group_id = p_group and member_id = p_member;
  else
    delete from tip_members where group_id = p_group and member_id = p_member;
  end if;
end;
$$;

-- Ältere App-Versionen rufen weiter kt_tip_kick auf: das bleibt „Sperren“.
create or replace function public.kt_tip_kick(p_device uuid, p_group uuid, p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform kt_tip_remove(p_device, p_group, p_member, true);
end;
$$;

-- Vom Ersteller Gesperrte (nur für den Ersteller sichtbar).
create or replace function public.kt_tip_banned(p_device uuid, p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from tip_groups where id = p_group and owner_device = p_device) then
    raise exception 'not owner';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.member_id, 'name', m.name) order by m.name)
      from tip_members m
     where m.group_id = p_group and m.banned and m.banned_by is distinct from 'admin'
  ), '[]'::jsonb);
end;
$$;

-- Entsperren: Eintrag weg, die Person kann mit dem Code wieder anfragen.
create or replace function public.kt_tip_unban(p_device uuid, p_group uuid, p_member uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tip_groups where id = p_group and owner_device = p_device) then
    raise exception 'not owner';
  end if;
  delete from tip_members
   where group_id = p_group and member_id = p_member
     and banned and banned_by is distinct from 'admin';
end;
$$;

-- Für den Hinweis: alle Sperren dieses Geräts, mit wer gesperrt hat.
create or replace function public.kt_tip_my_bans(p_device uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'name', g.name, 'by', coalesce(m.banned_by, 'owner'))), '[]'::jsonb)
    from tip_members m join tip_groups g on g.id = m.group_id
   where m.device_id = p_device and m.banned;
$$;

revoke all on function public.kt_tip_remove(uuid, uuid, uuid, boolean) from public;
revoke all on function public.kt_tip_kick(uuid, uuid, uuid) from public;
revoke all on function public.kt_tip_banned(uuid, uuid) from public;
revoke all on function public.kt_tip_unban(uuid, uuid, uuid) from public;
revoke all on function public.kt_tip_my_bans(uuid) from public;
grant execute on function public.kt_tip_remove(uuid, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.kt_tip_kick(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.kt_tip_banned(uuid, uuid) to anon, authenticated;
grant execute on function public.kt_tip_unban(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.kt_tip_my_bans(uuid) to anon, authenticated;
