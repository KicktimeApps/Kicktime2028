-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Sperre-Hinweis“
--
-- Wer im Admin-Bereich aus einer Tipprunde gesperrt wird, bekommt einen
-- eigenen Hinweis („Gesperrt“) statt „Nicht mehr dabei“. Dafür merkt sich
-- die Mitgliedschaft, dass der Betreiber gesperrt hat.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261021090000_admin_ausbau.sql).
-- ════════════════════════════════════════════════════════════════════════

alter table public.tip_members add column if not exists banned_by text;
alter table public.tip_members drop constraint if exists tip_members_banned_by_check;
alter table public.tip_members
  add constraint tip_members_banned_by_check check (banned_by in ('owner', 'admin'));

-- Wie im Admin-Ausbau, nur mit Vermerk „vom Betreiber gesperrt“.
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
    update tip_members set banned = true, banned_by = 'admin'
     where group_id = p_group and member_id = p_member;
  else
    delete from tip_members where group_id = p_group and member_id = p_member;
  end if;
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

-- Runden, aus denen dieses Gerät vom Betreiber gesperrt wurde (für den Hinweis).
create or replace function public.kt_tip_my_bans(p_device uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name)), '[]'::jsonb)
    from tip_members m join tip_groups g on g.id = m.group_id
   where m.device_id = p_device and m.banned and m.banned_by = 'admin';
$$;

revoke all on function public.kt_admin_remove_member(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.kt_admin_remove_member(uuid, uuid, boolean) to service_role;
revoke all on function public.kt_tip_my_bans(uuid) from public;
grant execute on function public.kt_tip_my_bans(uuid) to anon, authenticated;
