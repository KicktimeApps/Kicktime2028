-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – komplettes Datenbankschema (Supabase / PostgreSQL)
--
-- Einmalig im Supabase SQL-Editor ausführen (oder `supabase db push`).
-- Grundsatz: Der Browser (anon key) bekommt KEINEN direkten Schreibzugriff
-- auf fremde Daten. Schreiben läuft über SECURITY-DEFINER-Funktionen, die
-- nur die eigene, zufällige Geräte-ID betreffen, oder über Edge Functions
-- mit Service-Role-Key.
-- ════════════════════════════════════════════════════════════════════════

-- ---------- Live-Daten -------------------------------------------------

-- Kurzzeit-Cache der Upstream-Antwort (OpenLigaDB)
create table if not exists public.live_cache (
  id          text primary key,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

-- Dauerhaft gespeicherte Ergebnisse: beendete Spiele werden nie wieder
-- überschrieben, auch wenn die Quelle später fehlerhafte Daten liefert.
create table if not exists public.match_results (
  external_id  text primary key,
  fixture      jsonb not null,
  finished     boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- Manuelle Korrekturen aus dem Admin-Bereich (match_id = KickTime-ID, z. B. "m29")
create table if not exists public.match_overrides (
  match_id    text primary key,
  status      text not null check (status in ('scheduled', 'live', 'finished')),
  score_home  smallint not null check (score_home between 0 and 50),
  score_away  smallint not null check (score_away between 0 and 50),
  pens_home   smallint check (pens_home between 0 and 50),
  pens_away   smallint check (pens_away between 0 and 50),
  phase       text check (phase in ('first', 'half', 'second', 'extra', 'penalties')),
  updated_at  timestamptz not null default now()
);

-- ---------- Push-Erinnerungen -----------------------------------------

create table if not exists public.push_subscriptions (
  device_id     uuid primary key,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  last_seen_at  timestamptz not null default now()
);

create table if not exists public.match_alarms (
  device_id      uuid not null references public.push_subscriptions (device_id) on delete cascade,
  match_id       text not null,
  kickoff_utc    timestamptz not null,
  lead_minutes   smallint not null default 15,
  title          text not null,
  -- Für welche Anstoßzeit bereits benachrichtigt wurde. Ändert sich die
  -- Anstoßzeit (z. B. offizielle Zeit nach der Auslosung), wird erneut erinnert.
  notified_for   timestamptz,
  primary key (device_id, match_id)
);
create index if not exists match_alarms_kickoff_idx on public.match_alarms (kickoff_utc);

-- ---------- Statistik & Feedback --------------------------------------

create table if not exists public.app_pings (
  client_id    uuid primary key,
  last_ping    timestamptz not null default now(),
  app_version  text,
  fav_team     text
);

create table if not exists public.app_feedback (
  id           bigint generated always as identity primary key,
  device_id    uuid,
  rating       smallint not null check (rating between -1 and 1),
  message      text check (char_length(message) <= 1000),
  app_version  text,
  created_at   timestamptz not null default now()
);

-- Fehlversuche beim Admin-Login (Brute-Force-Schutz)
create table if not exists public.admin_attempts (
  key           text primary key,
  failures      int not null default 0,
  window_start  timestamptz not null default now()
);

-- ---------- Row Level Security ----------------------------------------

alter table public.live_cache          enable row level security;
alter table public.match_results       enable row level security;
alter table public.match_overrides     enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.match_alarms        enable row level security;
alter table public.app_pings           enable row level security;
alter table public.app_feedback        enable row level security;
alter table public.admin_attempts      enable row level security;

revoke all on public.live_cache, public.match_results, public.match_overrides,
  public.push_subscriptions, public.match_alarms, public.app_pings,
  public.app_feedback, public.admin_attempts from anon, authenticated;

-- Korrekturen sind öffentlich lesbar (werden allen angezeigt)
grant select on public.match_overrides to anon, authenticated;
drop policy if exists "overrides lesbar" on public.match_overrides;
create policy "overrides lesbar" on public.match_overrides for select to anon, authenticated using (true);

-- Feedback: nur anlegen, nicht lesen
grant insert on public.app_feedback to anon, authenticated;
drop policy if exists "feedback anlegen" on public.app_feedback;
create policy "feedback anlegen" on public.app_feedback for insert to anon, authenticated with check (true);

-- ---------- Funktionen für den Browser ---------------------------------

-- Push-Abo des eigenen Geräts speichern
create or replace function public.kt_save_subscription(
  p_device uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language sql security definer set search_path = public as $$
  insert into push_subscriptions (device_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (p_device, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 250), now())
  on conflict (device_id) do update
    set endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen_at = now();
$$;

-- Erinnerungen des eigenen Geräts komplett ersetzen.
-- p_alarms: [{ "match_id": "m01", "kickoff_utc": "...", "lead_minutes": 15, "title": "..." }]
create or replace function public.kt_sync_alarms(p_device uuid, p_alarms jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from push_subscriptions where device_id = p_device) then
    return;
  end if;
  if jsonb_array_length(p_alarms) > 60 then
    raise exception 'too many alarms';
  end if;
  delete from match_alarms a
   where a.device_id = p_device
     and a.match_id not in (select x->>'match_id' from jsonb_array_elements(p_alarms) x);
  insert into match_alarms (device_id, match_id, kickoff_utc, lead_minutes, title)
  select p_device, x->>'match_id', (x->>'kickoff_utc')::timestamptz,
         coalesce((x->>'lead_minutes')::smallint, 15), left(x->>'title', 120)
    from jsonb_array_elements(p_alarms) x
  on conflict (device_id, match_id) do update
    set kickoff_utc = excluded.kickoff_utc, lead_minutes = excluded.lead_minutes, title = excluded.title;
end;
$$;

-- Anonymer Nutzungs-Ping
create or replace function public.kt_ping(p_client uuid, p_version text, p_fav text) returns void
language sql security definer set search_path = public as $$
  insert into app_pings (client_id, last_ping, app_version, fav_team)
  values (p_client, now(), left(p_version, 20), left(p_fav, 3))
  on conflict (client_id) do update
    set last_ping = now(), app_version = excluded.app_version, fav_team = excluded.fav_team;
$$;

revoke all on function public.kt_save_subscription(uuid, text, text, text, text) from public;
revoke all on function public.kt_sync_alarms(uuid, jsonb) from public;
revoke all on function public.kt_ping(uuid, text, text) from public;
grant execute on function public.kt_save_subscription(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.kt_sync_alarms(uuid, jsonb) to anon, authenticated;
grant execute on function public.kt_ping(uuid, text, text) to anon, authenticated;

-- ---------- Cron: Push-Erinnerungen jede Minute ------------------------
-- Voraussetzung: Extensions pg_cron und pg_net aktiviert. PROJEKT-REF und
-- CRON_SECRET (gleicher Wert wie das Edge-Function-Secret) ersetzen:
--
-- select cron.schedule('kicktime-push', '* * * * *', $$
--   select net.http_post(
--     url := 'https://PROJEKT-REF.supabase.co/functions/v1/send-push-reminders',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'CRON_SECRET'),
--     body := '{}'::jsonb
--   );
-- $$);
