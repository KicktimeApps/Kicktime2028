-- ════════════════════════════════════════════════════════════════════════
-- KickTime 2028 – Update „Feedback mit Kategorie“
--
--  - Feedback bekommt eine Kategorie (Idee, Fehler, Lob, Sonstiges).
--  - Die Bewertung (👎 😐 👍) ist freiwillig – bei einer Fehlermeldung passt sie
--    oft nicht. Leer darf ein Feedback aber nicht sein (Text oder Bewertung).
--  - Grenze bleibt: höchstens 3 pro Gerät und Tag.
--  - Neue Funktion kt_send_feedback (mit Kategorie). Die alte kt_submit_feedback
--    bleibt unverändert für ältere App-Stände bestehen.
--
-- Einmalig im Supabase SQL-Editor ausführen (nach 20261022220000_suchpfad_aufrufer.sql).
-- Danach die Edge Function `admin` neu deployen (zeigt die Kategorie an).
-- ════════════════════════════════════════════════════════════════════════

alter table public.app_feedback add column if not exists category text;
alter table public.app_feedback drop constraint if exists app_feedback_category_check;
alter table public.app_feedback
  add constraint app_feedback_category_check
  check (category is null or category in ('idee', 'fehler', 'lob', 'sonstiges'));
alter table public.app_feedback alter column rating drop not null;

create or replace function public.kt_send_feedback(
  p_device uuid,
  p_category text,
  p_rating smallint,
  p_message text,
  p_version text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  msg text := left(nullif(trim(p_message), ''), 1000);
begin
  if p_rating is not null and p_rating not between -1 and 1 then
    raise exception 'invalid rating';
  end if;
  if p_category is not null and p_category not in ('idee', 'fehler', 'lob', 'sonstiges') then
    raise exception 'invalid category';
  end if;
  if p_rating is null and msg is null then
    raise exception 'feedback empty';
  end if;
  if (select count(*) from app_feedback
       where device_id = p_device and created_at > now() - interval '1 day') >= 3 then
    raise exception 'feedback limit';
  end if;
  insert into app_feedback (device_id, rating, message, app_version, category)
  values (p_device, p_rating, msg, left(p_version, 20), p_category);
end;
$$;

revoke all on function public.kt_send_feedback(uuid, text, smallint, text, text) from public;
grant execute on function public.kt_send_feedback(uuid, text, smallint, text, text)
  to anon, authenticated;
