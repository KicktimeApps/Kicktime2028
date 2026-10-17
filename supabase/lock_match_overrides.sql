-- Manuell im Supabase SQL Editor ausführen (Cloud → SQL Editor):
--
-- Sperrt public.match_overrides so, dass NUR die Edge Function
-- `admin-override` (service-role key, PIN-validiert serverseitig) schreiben
-- darf. SELECT bleibt public, weil Live-Scores sowieso allen Besuchern
-- angezeigt werden.

alter table public.match_overrides enable row level security;

drop policy if exists "anon write overrides" on public.match_overrides;
drop policy if exists "anon read overrides"  on public.match_overrides;
drop policy if exists "public read overrides" on public.match_overrides;

create policy "public read overrides"
  on public.match_overrides
  for select
  to anon, authenticated
  using (true);

-- Kein INSERT/UPDATE/DELETE-Policy für anon/authenticated → RLS default-deny.
revoke insert, update, delete on public.match_overrides from anon, authenticated;
grant  select                on public.match_overrides to   anon, authenticated;
grant  all                   on public.match_overrides to   service_role;
