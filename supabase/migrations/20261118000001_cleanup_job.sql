-- Pickle: the cleanup job (milestone 9, Nov 18, 2026)
--
-- The product spec promises that lobbies, members, picks, votes and saved
-- places are deleted after 24 hours. Every lobby already stops working at
-- expires_at (24 hours after it was made); this deletes it, and everything
-- in it, once that time has passed:
--
--   - lobbies past expires_at, with their members, games, picks, options,
--     card views, votes and round results (all `on delete cascade`).
--   - rate-limit counters whose window ended more than an hour ago (they
--     hold a device hash and a count, nothing else).
--   - daily API usage rows older than 90 days (counts only; kept a while to
--     compare against the free-plan limits).
--
-- It runs every hour through pg_cron (Supabase includes it), so nothing
-- stays more than about 25 hours. Plain Postgres without pg_cron (the local
-- SQL tests) gets the function but no schedule.

create or replace function public.cleanup_old_data()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lobbies integer;
  v_limits integer;
  v_usage integer;
begin
  delete from public.lobbies where expires_at <= now();
  get diagnostics v_lobbies = row_count;

  delete from public.rate_limits where reset_at < now() - interval '1 hour';
  get diagnostics v_limits = row_count;

  delete from public.api_usage where day < (now() at time zone 'utc')::date - 90;
  get diagnostics v_usage = row_count;

  return jsonb_build_object('lobbies', v_lobbies, 'rate_limits', v_limits, 'api_usage', v_usage);
end;
$$;

revoke all on function public.cleanup_old_data() from public, anon, authenticated;
grant execute on function public.cleanup_old_data() to service_role;

-- Every hour at 17 past. Scheduling again under the same name replaces the
-- job, so this migration can be re-run safely.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('pickle-cleanup', '17 * * * *', 'select public.cleanup_old_data()');
  else
    raise notice 'pg_cron is not available here: cleanup_old_data() is not scheduled';
  end if;
end $$;
