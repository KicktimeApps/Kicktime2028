-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Team-App: Personensuche, Rundentabelle, Protokoll“
--
--  - kt_admin_find_person(text): Suche nach einem Namen über alle Tipprunden.
--    Treffer je Gerät: alle Mitgliedschaften (Runde, Name, Status, Tipps),
--    Sperre „überall“ und Entsperrungsanträge. Mindestens 2 Zeichen, höchstens
--    25 Geräte.
--  - kt_admin_group_board(uuid): Mitglieder einer Runde mit ihren Tipps – wie
--    die Mitglieder sie sehen (Tipps erst ab Anpfiff, Europameister-Tipp erst
--    ab dem Eröffnungsspiel). Die Team-App rechnet daraus dieselbe Tabelle.
--  - kt_team_log: Protokoll aller ändernden Aktionen des KickTime-Teams
--    (Zeit, Aktion, Klartext, Gerät). Schreibt und liest nur die Edge
--    Function admin; Einträge älter als 180 Tage löscht sie selbst.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261023170000_zustellung_aufraeumen.sql).
-- Danach die Edge Function `admin` neu deployen.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.kt_team_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  action text not null,
  detail text,
  device_id uuid
);
create index if not exists kt_team_log_at on public.kt_team_log (at desc);
alter table public.kt_team_log enable row level security;

-- Personensuche über alle Runden (auch überall Gesperrte ohne Runde).
create or replace function public.kt_admin_find_person(p_query text)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (
    -- Platzhalter im Suchtext wörtlich nehmen.
    select '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
     where length(trim(coalesce(p_query, ''))) >= 2
  ),
  hits as (
    select device_id from (
      select m.device_id, max(m.joined_at) as seen
        from tip_members m, q where m.name ilike q.pat group by m.device_id
      union all
      select b.device_id, b.created_at from kt_device_bans b, q where b.label ilike q.pat
    ) x
    group by device_id
    order by max(seen) desc
    limit 25
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'device', h.device_id,
    'ban', (select jsonb_build_object('label', b.label, 'reason', b.reason, 'createdAt', b.created_at)
              from kt_device_bans b where b.device_id = h.device_id),
    'memberships', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'groupId', g.id, 'groupName', g.name, 'code', g.code,
               'memberId', m.member_id, 'name', m.name,
               'owner', g.owner_device = m.device_id,
               'approved', m.approved, 'banned', m.banned, 'bannedBy', m.banned_by,
               'joinedAt', m.joined_at,
               'tips', (select count(*) from tip_predictions p
                         where p.group_id = m.group_id and p.device_id = m.device_id)
             ) order by m.joined_at), '[]'::jsonb)
        from tip_members m join tip_groups g on g.id = m.group_id
       where m.device_id = h.device_id),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'scope', r.scope, 'status', r.status, 'groupName', g.name,
               'message', r.message, 'reply', r.reply, 'createdAt', r.created_at
             ) order by r.created_at desc), '[]'::jsonb)
        from kt_unban_requests r left join tip_groups g on g.id = r.group_id
       where r.target_device = h.device_id)
  )), '[]'::jsonb)
  from hits h;
$$;

-- Tabelle einer Runde aus Sicht der Mitglieder (ohne selbst Mitglied zu sein).
create or replace function public.kt_admin_group_board(p_group uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  g tip_groups;
  started boolean := kt_tip_opener_started();
begin
  select * into g from tip_groups where id = p_group;
  if g.id is null then raise exception 'group not found'; end if;
  return jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.member_id, 'name', m.name,
               'isOwner', m.device_id = g.owner_device,
               'champion', case when started then (
                 select b.champion from tip_bonus b
                  where b.group_id = p_group and b.device_id = m.device_id) end,
               'tips', (
                 select coalesce(jsonb_object_agg(t.match_id,
                          jsonb_build_object('home', t.home, 'away', t.away)), '{}'::jsonb)
                   from tip_predictions t
                   join kt_fixtures f on f.match_id = t.match_id
                  where t.group_id = p_group and t.device_id = m.device_id
                    and f.kickoff_utc <= now())
             ) order by m.joined_at), '[]'::jsonb)
        from tip_members m
       where m.group_id = p_group and not m.banned and m.approved
    )
  );
end;
$$;

-- ---------------------------------------------------------------- Rechte

revoke all on public.kt_team_log from anon, authenticated;
revoke all on sequence public.kt_team_log_id_seq from anon, authenticated;

revoke all on function public.kt_admin_find_person(text) from public, anon, authenticated;
revoke all on function public.kt_admin_group_board(uuid) from public, anon, authenticated;
grant execute on function public.kt_admin_find_person(text) to service_role;
grant execute on function public.kt_admin_group_board(uuid) to service_role;
