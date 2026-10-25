-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Gerät vergessen, Meldungen absichern, Spielorte“
--
--  - kt_forget_device: „Alle Daten löschen“ in der App räumt jetzt auch den
--    Server auf. Das Gerät tritt aus allen Tipprunden aus (Leitung geht wie
--    beim Austreten ans älteste Mitglied, allein → Runde gelöscht), sein
--    Push-Abo samt Erinnerungen und wartende Mitteilungen werden gelöscht.
--    Bisher blieb es als Mitglied stehen und bekam weiter „Noch kein Tipp“.
--    Sperren bleiben bestehen (sonst wäre Löschen ein Weg, sie loszuwerden).
--  - kt_report_source: zählt nur noch Geräte, die die App wirklich nutzen
--    (Push-Abo oder seit mindestens 6 Stunden bekannt). Vorher reichten
--    zwei ausgedachte Geräte-IDs für einen Alarm an das Team.
--  - kt_fixtures.city: Spielort je Spiel, damit der Wächter die Anstoßzeiten
--    der Tipp-Sperre mit OpenLigaDB vergleichen kann (Spiel für Spiel).
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261025200000_team_passkeys.sql).
-- Danach die Edge Functions `admin` und `send-push-reminders` neu deployen.
-- ════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------- Spielorte

alter table public.kt_fixtures add column if not exists city text;

update public.kt_fixtures f
   set city = v.city
  from (values
  ('m01', 'Cardiff'),
  ('m02', 'Glasgow'),
  ('m03', 'Manchester'),
  ('m04', 'Dublin'),
  ('m05', 'London'),
  ('m06', 'Birmingham'),
  ('m07', 'Liverpool'),
  ('m08', 'London'),
  ('m09', 'Dublin'),
  ('m10', 'Newcastle'),
  ('m11', 'Glasgow'),
  ('m12', 'Manchester'),
  ('m13', 'Cardiff'),
  ('m14', 'Liverpool'),
  ('m15', 'London'),
  ('m16', 'Birmingham'),
  ('m17', 'London'),
  ('m18', 'Newcastle'),
  ('m19', 'London'),
  ('m20', 'Manchester'),
  ('m21', 'Dublin'),
  ('m22', 'Liverpool'),
  ('m23', 'Glasgow'),
  ('m24', 'Newcastle'),
  ('m25', 'Cardiff'),
  ('m26', 'London'),
  ('m27', 'London'),
  ('m28', 'Dublin'),
  ('m29', 'Manchester'),
  ('m30', 'Liverpool'),
  ('m31', 'Birmingham'),
  ('m32', 'Newcastle'),
  ('m33', 'Dublin'),
  ('m34', 'London'),
  ('m35', 'Glasgow'),
  ('m36', 'Cardiff'),
  ('m37', 'Cardiff'),
  ('m38', 'Liverpool'),
  ('m39', 'Newcastle'),
  ('m40', 'Manchester'),
  ('m41', 'Glasgow'),
  ('m42', 'London'),
  ('m43', 'Birmingham'),
  ('m44', 'Dublin'),
  ('m45', 'London'),
  ('m46', 'Dublin'),
  ('m47', 'Glasgow'),
  ('m48', 'Cardiff'),
  ('m49', 'London'),
  ('m50', 'London'),
  ('m51', 'London')
  ) as v (match_id, city)
 where f.match_id = v.match_id
   and f.city is distinct from v.city;

-- ---------------------------------------------------------------- Gerät vergessen

create or replace function public.kt_forget_device(p_device uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g record;
  n int := 0;
begin
  if p_device is null then
    return jsonb_build_object('left', 0);
  end if;
  -- Wie „Austreten“ – inkl. Übergabe der Leitung bzw. Löschen leerer Runden.
  for g in select m.group_id from tip_members m
            where m.device_id = p_device and not m.banned loop
    perform kt_tip_leave(p_device, g.group_id);
    n := n + 1;
  end loop;
  delete from push_subscriptions where device_id = p_device; -- Erinnerungen per Kaskade
  delete from match_alarms where device_id = p_device;
  delete from tip_push_queue where device_id = p_device;
  delete from kt_push_queue where device_id = p_device;
  delete from kt_tip_reminders_sent where device_id = p_device;
  delete from kt_source_reports where device_id = p_device;
  return jsonb_build_object('left', n);
end;
$$;

-- ---------------------------------------------------------------- Meldungen der Geräte

create or replace function public.kt_report_source(p_device uuid, p_source text, p_detail text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_device is null or p_source is null or p_source not in ('espn', 'backend') then
    return;
  end if;
  -- Nur Geräte, die die App wirklich nutzen: mit Push-Abo oder seit 6 Std. bekannt.
  if not exists (select 1 from push_subscriptions s where s.device_id = p_device)
     and not exists (select 1 from app_pings p
                      where p.client_id = p_device
                        and p.first_seen <= now() - interval '6 hours') then
    return;
  end if;
  -- Je Gerät und Quelle höchstens alle 5 Minuten.
  if exists (select 1 from kt_source_reports r
              where r.device_id = p_device and r.source = p_source
                and r.created_at > now() - interval '5 minutes') then
    return;
  end if;
  -- Schutz gegen Fluten: höchstens 500 Meldungen pro Stunde insgesamt.
  if (select count(*) from kt_source_reports r
       where r.created_at > now() - interval '1 hour') >= 500 then
    return;
  end if;
  insert into kt_source_reports (device_id, source, detail)
  values (p_device, p_source, left(coalesce(p_detail, ''), 200));
  delete from kt_source_reports r where r.created_at < now() - interval '2 days';
end;
$$;

-- ---------------------------------------------------------------- Rechte

revoke all on function public.kt_forget_device(uuid) from public;
grant execute on function public.kt_forget_device(uuid) to anon, authenticated;
revoke all on function public.kt_report_source(uuid, text, text) from public;
grant execute on function public.kt_report_source(uuid, text, text) to anon, authenticated;
