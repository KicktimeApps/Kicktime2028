-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Härtung“ (Sicherheit & Zuverlässigkeit)
--
-- Einmalig im Supabase SQL-Editor ausführen. Kann gefahrlos mehrfach laufen.
-- Die Edge Functions `admin` und `send-push-reminders` funktionieren auch
-- ohne dieses Update weiter (sie fallen dann auf das alte Verhalten zurück),
-- nutzen die neuen Funktionen aber, sobald sie da sind.
-- ════════════════════════════════════════════════════════════════════════

-- ---------- Admin: Fehlversuche atomar zählen ----------------------------
-- Zählt VOR dem PIN-Vergleich hoch (in einem Schritt). So können auch viele
-- gleichzeitige Anfragen das Limit nicht umgehen.
create or replace function public.kt_admin_attempt(p_keys text[])
returns table (r_key text, r_failures int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  insert into admin_attempts as a (key, failures, window_start)
  select k, 1, now() from unnest(p_keys) as k
  on conflict (key) do update set
    failures = case when a.window_start < now() - interval '15 minutes' then 1 else a.failures + 1 end,
    window_start = case when a.window_start < now() - interval '15 minutes' then now() else a.window_start end
  returning a.key, a.failures;
end;
$$;

-- Richtige PIN: den Versuch wieder abziehen (Admin-Aktionen zählen nicht).
create or replace function public.kt_admin_ok(p_keys text[]) returns void
language sql security definer set search_path = public as $$
  update admin_attempts set failures = greatest(0, failures - 1) where key = any (p_keys);
$$;

revoke all on function public.kt_admin_attempt(text[]) from public, anon, authenticated;
revoke all on function public.kt_admin_ok(text[]) from public, anon, authenticated;
grant execute on function public.kt_admin_attempt(text[]) to service_role;
grant execute on function public.kt_admin_ok(text[]) to service_role;

-- ---------- Push: fällige Erinnerungen atomar beanspruchen ---------------
-- Markiert fällige Erinnerungen und liefert sie in einem Schritt zurück.
-- Laufen zwei Cron-Aufrufe gleichzeitig, bekommt jede Erinnerung nur einer.
create or replace function public.kt_claim_due_alarms()
returns table (
  device_id uuid, match_id text, kickoff_utc timestamptz, title text,
  endpoint text, p256dh text, auth text
)
language sql security definer set search_path = public as $$
  with due as (
    update match_alarms a
       set notified_for = a.kickoff_utc
     where a.kickoff_utc > now()
       and a.kickoff_utc <= now() + make_interval(mins => a.lead_minutes)
       and a.notified_for is distinct from a.kickoff_utc
    returning a.device_id, a.match_id, a.kickoff_utc, a.title
  )
  select d.device_id, d.match_id, d.kickoff_utc, d.title, s.endpoint, s.p256dh, s.auth
    from due d
    join push_subscriptions s on s.device_id = d.device_id;
$$;

-- Versand vorübergehend fehlgeschlagen → beim nächsten Lauf erneut versuchen.
create or replace function public.kt_release_alarm(p_device uuid, p_match text) returns void
language sql security definer set search_path = public as $$
  update match_alarms set notified_for = null where device_id = p_device and match_id = p_match;
$$;

revoke all on function public.kt_claim_due_alarms() from public, anon, authenticated;
revoke all on function public.kt_release_alarm(uuid, text) from public, anon, authenticated;
grant execute on function public.kt_claim_due_alarms() to service_role;
grant execute on function public.kt_release_alarm(uuid, text) to service_role;

-- ---------- Push-Abo: nur echte Push-Dienste, keine Doppel-Abos ----------
create or replace function public.kt_save_subscription(
  p_device uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Nur bekannte Push-Dienste (Apple, Google, Mozilla, Microsoft). Verhindert,
  -- dass der Server Anfragen an beliebige Adressen schickt.
  if p_endpoint is null
     or char_length(p_endpoint) > 1000
     or p_endpoint !~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|googleapis\.com|mozilla\.com|notify\.windows\.com)/'
  then
    raise exception 'push endpoint not allowed';
  end if;
  if char_length(coalesce(p_p256dh, '')) not between 20 and 200
     or char_length(coalesce(p_auth, '')) not between 8 and 100 then
    raise exception 'invalid push keys';
  end if;
  -- Gleiches Abo unter anderer Geräte-ID (z. B. nach gelöschten Daten) entfernen,
  -- sonst käme jede Erinnerung doppelt.
  delete from push_subscriptions where endpoint = p_endpoint and device_id <> p_device;
  insert into push_subscriptions (device_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (p_device, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 250), now())
  on conflict (device_id) do update
    set endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen_at = now();
end;
$$;

-- ---------- Erinnerungen: Eingaben begrenzen ------------------------------
create or replace function public.kt_sync_alarms(p_device uuid, p_alarms jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  list jsonb := coalesce(p_alarms, '[]'::jsonb);
begin
  if jsonb_typeof(list) <> 'array' then
    raise exception 'alarms must be an array';
  end if;
  if not exists (select 1 from push_subscriptions where device_id = p_device) then
    return;
  end if;
  if jsonb_array_length(list) > 60 then
    raise exception 'too many alarms';
  end if;
  delete from match_alarms a
   where a.device_id = p_device
     and a.match_id not in (select x->>'match_id' from jsonb_array_elements(list) x);
  insert into match_alarms (device_id, match_id, kickoff_utc, lead_minutes, title)
  select distinct on (x->>'match_id')
         p_device, x->>'match_id', (x->>'kickoff_utc')::timestamptz,
         least(60, greatest(1, coalesce((x->>'lead_minutes')::int, 15)))::smallint,
         left(x->>'title', 120)
    from jsonb_array_elements(list) x
   where char_length(coalesce(x->>'match_id', '')) between 1 and 32
     and x->>'kickoff_utc' is not null
  on conflict (device_id, match_id) do update
    set kickoff_utc = excluded.kickoff_utc, lead_minutes = excluded.lead_minutes, title = excluded.title;
end;
$$;

revoke all on function public.kt_save_subscription(uuid, text, text, text, text) from public;
revoke all on function public.kt_sync_alarms(uuid, jsonb) from public;
grant execute on function public.kt_save_subscription(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.kt_sync_alarms(uuid, jsonb) to anon, authenticated;

-- ---------- Feedback: Längen begrenzen ------------------------------------
alter table public.app_feedback drop constraint if exists app_feedback_version_len;
alter table public.app_feedback
  add constraint app_feedback_version_len check (char_length(app_version) <= 20) not valid;
