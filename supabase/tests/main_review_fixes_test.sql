-- Tests for the fixes from Codex's review of main (Nov 13, 2026): rejoining
-- a started game passes the code check, and a lobby that ends deletes its
-- game and the host's location. Runs after all migrations.

\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- 1. The code check matches what join_lobby allows.
do $$
declare
  r jsonb; v_lobby uuid; v_host uuid; v_a uuid; v_b uuid; i int;
begin
  r := public.create_lobby('RJXX23', 'Host', 'dev-rh');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('RJXX23', 'Ana', 'dev-ra')->>'member_id')::uuid;
  v_b := (public.join_lobby('RJXX23', 'Ben', 'dev-rb')->>'member_id')::uuid;
  perform public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0, 'America/New_York');

  perform public.leave_lobby(v_lobby, v_a);
  perform public.remove_member(v_lobby, v_host, v_b);
  perform pg_temp.check(public.check_lobby_code('RJXX23', 'dev-ra') = 'ok', 'a phone that left can come back to a started game');
  perform pg_temp.check(public.join_lobby('RJXX23', 'Ana', 'dev-ra')->>'status' = 'ok', 'and join agrees');
  perform pg_temp.check(public.check_lobby_code('RJXX23', 'dev-ra') = 'member', 'then it is a member again');
  perform pg_temp.check(public.check_lobby_code('RJXX23', 'dev-rb') = 'removed', 'a removed phone stays removed');
  perform pg_temp.check(public.check_lobby_code('RJXX23', 'dev-new') = 'locked', 'a new phone still cannot join a started game');
  perform pg_temp.check(public.check_lobby_code('RJXX23', 'dev-x', 3) = 'locked', 'not by name either');

  -- Open and full: a returning phone needs room, like join_lobby.
  r := public.create_lobby('RJYY23', 'Host', 'dev-rh2');
  v_lobby := (r->>'lobby_id')::uuid;
  v_a := (public.join_lobby('RJYY23', 'Ana', 'dev-ra2')->>'member_id')::uuid;
  perform public.leave_lobby(v_lobby, v_a);
  perform public.join_lobby('RJYY23', 'Cy', 'dev-rc2');
  perform pg_temp.check(public.check_lobby_code('RJYY23', 'dev-ra2', 2) = 'full', 'a returning phone needs room in an open lobby');
  perform pg_temp.check(public.join_lobby('RJYY23', 'Ana', 'dev-ra2', 2)->>'status' = 'full', 'and join agrees');
  perform pg_temp.check(public.check_lobby_code('RJYY23', 'dev-ra2', 10) = 'ok', 'with room it may come back');
end $$;

-- 2. A lobby that ends takes its game (and the host's location) with it.
do $$
declare
  r jsonb; v_lobby uuid; v_host uuid; v_a uuid; v_game uuid;
begin
  -- The only real member leaves during picks; demo friends don't keep it going.
  r := public.create_lobby('LCXX23', 'Host', 'dev-lh');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  perform public.add_demo_friends(v_lobby, v_host, array['Demo Dee'], 10);
  v_game := (public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 2::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;
  insert into public.options (game_id, source, source_id, name, distance_mi, score)
    values (v_game, 'geoapify', 'lc-1', 'Place', 1, 80);
  perform public.leave_lobby(v_lobby, v_host);
  perform pg_temp.check((select status = 'ended' and current_game_id is null from public.lobbies where id = v_lobby), 'last real member leaving ends the lobby');
  perform pg_temp.check(not exists (select 1 from public.games where id = v_game), 'its game and location are deleted at once');
  perform pg_temp.check(not exists (select 1 from public.options where game_id = v_game), 'and the places found for it');

  -- With another real member, the game and location stay for later rounds.
  r := public.create_lobby('LCYY23', 'Host', 'dev-lh2');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('LCYY23', 'Ana', 'dev-la2')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 2::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;
  perform public.leave_lobby(v_lobby, v_host);
  perform pg_temp.check((select host_member_id = v_a and current_game_id = v_game from public.lobbies where id = v_lobby), 'the host role passes and the game continues');
  perform pg_temp.check((select center_lat is not null from public.games where id = v_game), 'the location stays for the next search');

  -- Then the last one leaves: everything goes.
  perform public.leave_lobby(v_lobby, v_a);
  perform pg_temp.check(not exists (select 1 from public.games where id = v_game), 'the last member leaving deletes the game');
end $$;
