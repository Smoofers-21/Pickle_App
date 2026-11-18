-- Tests for the cleanup job (milestone 9): expired lobbies and everything in
-- them go; live lobbies, recent counters and recent usage stay.

\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

do $$
declare
  r jsonb;
  v_old uuid; v_old_host uuid; v_new uuid; v_live uuid; v_live_host uuid; v_game uuid; v_opt uuid;
begin
  -- An old lobby with a finished game in it, moved on by Change lobby.
  r := public.create_lobby('CUAA23', 'Host', 'dev-cu1');
  v_old := (r->>'lobby_id')::uuid; v_old_host := (r->>'member_id')::uuid;
  perform public.join_lobby('CUAA23', 'Ana', 'dev-cu2');
  v_game := (public.start_game(v_old, v_old_host, 'food', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;
  insert into public.options (game_id, shown_in_round, source, source_id, name, distance_mi, score)
    values (v_game, 1, 'geoapify', 'cu-1', 'Place', 1, 80) returning id into v_opt;
  update public.games set stage = 'results' where id = v_game;
  perform public.change_lobby(v_old, v_old_host, 'CUBB23');
  select id into v_new from public.lobbies where code = 'CUBB23';

  -- A second old lobby that still has its game, picks and options.
  r := public.create_lobby('CUCC23', 'Host', 'dev-cu3');
  v_live := (r->>'lobby_id')::uuid; v_live_host := (r->>'member_id')::uuid;
  v_game := (public.start_game(v_live, v_live_host, 'food', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;
  insert into public.options (game_id, shown_in_round, source, source_id, name, distance_mi, score)
    values (v_game, 1, 'geoapify', 'cu-2', 'Place', 1, 80);

  -- The first lobby and the third are past 24 hours; the moved-to one isn't.
  update public.lobbies set expires_at = now() - interval '1 minute' where id in (v_old, v_live);

  insert into public.rate_limits values ('join:old', 3, now() - interval '2 hours'), ('join:new', 3, now() + interval '5 minutes');
  insert into public.api_usage (day, provider, units, calls) values
    ((now() at time zone 'utc')::date - 120, 'geoapify', 5, 1),
    ((now() at time zone 'utc')::date - 10, 'geoapify', 5, 1);

  r := public.cleanup_old_data();
  perform pg_temp.check((r->>'lobbies')::int = 2, 'two expired lobbies deleted');
  perform pg_temp.check(not exists (select 1 from public.lobbies where id in (v_old, v_live)), 'expired lobbies are gone');
  perform pg_temp.check(not exists (select 1 from public.members where lobby_id in (v_old, v_live)), 'with their members');
  perform pg_temp.check(not exists (select 1 from public.games where lobby_id in (v_old, v_live))
                        and not exists (select 1 from public.options where game_id = v_game), 'their games and saved places');
  perform pg_temp.check(not exists (select 1 from public.picks p join public.games g on g.id = p.game_id where g.lobby_id = v_live), 'and their picks');
  perform pg_temp.check(exists (select 1 from public.lobbies where id = v_new and status = 'open'), 'a live lobby stays');
  perform pg_temp.check((select count(*) from public.members where lobby_id = v_new) = 2, 'with its members');

  perform pg_temp.check(not exists (select 1 from public.rate_limits where bucket = 'join:old')
                        and exists (select 1 from public.rate_limits where bucket = 'join:new'), 'only finished rate-limit windows go');
  perform pg_temp.check((select count(*) from public.api_usage) = 1
                        and (select min(day) from public.api_usage) = (now() at time zone 'utc')::date - 10, 'only API usage older than 90 days goes');

  r := public.cleanup_old_data();
  perform pg_temp.check((r->>'lobbies')::int = 0 and (r->>'rate_limits')::int = 0, 'running it again deletes nothing more');

  -- Leave nothing behind for the later test files.
  delete from public.lobbies where id = v_new;
  delete from public.rate_limits where bucket = 'join:new';
  delete from public.api_usage;
end $$;

do $$
begin
  perform pg_temp.check(not has_function_privilege('anon', 'public.cleanup_old_data()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.cleanup_old_data()', 'EXECUTE')
    and has_function_privilege('service_role', 'public.cleanup_old_data()', 'EXECUTE'), 'cleanup_old_data is server-only');
end $$;
