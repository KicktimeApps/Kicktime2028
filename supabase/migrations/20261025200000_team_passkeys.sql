-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Team-App: Entsperren mit Face ID (Passkeys)“
--
--  - kt_team_passkeys: Passkeys der Team-Geräte (öffentlicher Schlüssel,
--    Zähler, Adresse der Team-App). Einrichten geht nur mit richtiger PIN.
--    Der private Schlüssel bleibt im Gerät (iCloud-Schlüsselbund).
--  - kt_team_challenges: einmalige Zufallswerte für Einrichten/Anmelden,
--    5 Minuten gültig (die Edge Function räumt selbst auf).
--
-- Nach dem Entsperren per Face ID gibt die Edge Function admin eine
-- signierte Freigabe aus (4 Stunden, nur im Speicher der Team-App), die
-- statt der PIN gilt. Gelöschter Passkey → Freigabe sofort ungültig.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261025180000_team_app.sql).
-- Danach die Edge Function `admin` neu deployen.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.kt_team_passkeys (
  id text primary key,              -- Credential-ID (base64url)
  public_key text not null,         -- öffentlicher Schlüssel (base64url, COSE)
  counter bigint not null default 0,
  transports text[],
  label text,
  rp_id text not null,              -- Domain der Team-App
  origin text not null,             -- z. B. https://kicktime2028-admin.….workers.dev
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.kt_team_passkeys enable row level security;

create table if not exists public.kt_team_challenges (
  challenge text primary key,
  kind text not null check (kind in ('register', 'login')),
  created_at timestamptz not null default now()
);
create index if not exists kt_team_challenges_created on public.kt_team_challenges (created_at);
alter table public.kt_team_challenges enable row level security;

-- ---------------------------------------------------------------- Rechte

revoke all on public.kt_team_passkeys from anon, authenticated;
revoke all on public.kt_team_challenges from anon, authenticated;
