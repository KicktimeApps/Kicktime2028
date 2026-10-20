-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Hinweis nach Entsperrung“
--
-- Der eigene Antragsstand enthält bei angenommenen Anträgen den Code der
-- Runde – so kann die App nach einer Entsperrung durch den Ersteller direkt
-- „Wieder beitreten“ anbieten. Nur für die entsperrte Person selbst.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261022090000_entsperrung.sql).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.kt_my_ban_status(p_device uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'global', exists (select 1 from kt_device_bans where device_id = p_device),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'scope', r.scope, 'groupId', r.group_id,
               'groupName', g.name,
               'groupCode', case when r.status = 'accepted' and r.target_device = p_device
                                 then g.code end,
               'forMember', r.target_device <> p_device,
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

revoke all on function public.kt_my_ban_status(uuid) from public;
grant execute on function public.kt_my_ban_status(uuid) to anon, authenticated;
