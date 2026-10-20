-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Suchpfad aller Server-Funktionen“
--
--  - Alle SECURITY-DEFINER-Funktionen (kt_*) bekommen den Suchpfad
--    „public, pg_temp“: Postgres sucht Tabellen sonst ZUERST im Temp-Bereich
--    der Sitzung – eine dort angelegte Tabelle „tip_groups“ oder
--    „kt_fixtures“ könnte die echte überdecken. Mit pg_temp am Ende nicht mehr.
--    (Gilt für alle vorhandenen Funktionen; neue/geänderte Funktionen müssen
--    selbst „set search_path = public, pg_temp“ angeben – siehe AGENTS.md.)
--  - Die internen Hilfsfunktionen sind nur noch für ihren Besitzer aufrufbar
--    (auch nicht mehr für service_role – niemand braucht sie direkt).
--  - kt_tip_create: zieht ein gleichzeitig erzeugter Code den Kürzeren
--    (Doppelvergabe), wird automatisch ein neuer gewürfelt statt Fehler.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261022200000_hilfsfunktionen_absichern.sql).
-- Keine Edge Function betroffen.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.kt_tip_create(p_device uuid, p_group_name text, p_player text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g tip_groups;
  gname text := regexp_replace(trim(coalesce(p_group_name, '')), '\s+', ' ', 'g');
  tries int := 0;
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
  -- Code prüfen und einfügen ist nicht atomar: bei Doppelvergabe neu würfeln.
  loop
    begin
      insert into tip_groups (code, name, owner_device)
      values (kt_tip_new_code(), gname, p_device)
      returning * into g;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries >= 5 then raise; end if;
    end;
  end loop;
  insert into tip_members (group_id, device_id, name)
  values (g.id, p_device, kt_tip_clean_name(p_player));
  return jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name);
end;
$$;
revoke all on function public.kt_tip_create(uuid, text, text) from public;
grant execute on function public.kt_tip_create(uuid, text, text) to anon, authenticated;

-- Suchpfad aller vorhandenen Server-Funktionen: pg_temp zuletzt.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proname like 'kt\_%'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end;
$$;

-- Hilfsfunktionen: nur der Besitzer (die Tipprunden-Funktionen laufen als dieser).
revoke all on function public.kt_tip_clean_name(text) from public, anon, authenticated, service_role;
revoke all on function public.kt_tip_new_code() from public, anon, authenticated, service_role;
revoke all on function public.kt_tip_opener_started() from public, anon, authenticated, service_role;
