-- Tests for game setup, picks and demo friends (milestone 3).
-- Runs after all migrations; see supabase/README.md.

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
  v_lobby uuid; v_host uuid; v_a uuid; v_b uuid; v_game uuid;
  v_pings int;
begin
  r := public.create_lobby('GAME23', 'Host', 'dev-host');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('GAME23', 'Ana', 'dev-a')->>'member_id')::uuid;
  v_b := (public.join_lobby('GAME23', 'Ben', 'dev-b')->>'member_id')::uuid;

  -- Starting the game
  r := public.start_game(v_lobby, v_a, 'food', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0);
  perform pg_temp.check(r->>'status' = 'not_host', 'only the host can start');
  select count(*) into v_pings from realtime.sent;
  r := public.start_game(v_lobby, v_host, 'events', '2026-11-14', 10, 'all', 'either', 2::smallint, 40.0, -74.0);
  v_game := (r->>'game_id')::uuid;
  perform pg_temp.check(r->>'status' = 'ok', 'host starts the game');
  perform pg_temp.check((select status from public.lobbies where id = v_lobby) = 'locked', 'starting locks the lobby');
  perform pg_temp.check((select current_game_id from public.lobbies where id = v_lobby) = v_game, 'lobby points at the game');
  perform pg_temp.check((select stage from public.games where id = v_game) = 'picks', 'game starts at picks');
  perform pg_temp.check((select count(*) from realtime.sent) > v_pings, 'starting pings the lobby');
  perform pg_temp.check(public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 0, 0)->>'status' = 'already_started',
                        'cannot start twice');
  perform pg_temp.check(public.join_lobby('GAME23', 'Late', 'dev-late')->>'status' = 'locked', 'newcomers are locked out');

  -- Food games never store an event date
  r := public.create_lobby('FDXX23', 'Cook', 'dev-cook');
  r := public.start_game((r->>'lobby_id')::uuid, (r->>'member_id')::uuid, 'food', '2026-11-14', 5, 'all', 'either', 1::smallint, 0, 0);
  perform pg_temp.check((select event_date from public.games where id = (r->>'game_id')::uuid) is null, 'food game has no event date');

  -- Picks
  perform pg_temp.check(public.submit_picks(v_game, v_host, 'country', null, 'pop', null)->>'stage' = 'picks', 'first pick: still waiting');
  perform pg_temp.check(public.submit_picks(v_game, v_a, 'other', 'Opera', null, null)->>'status' = 'ok', 'No can be Other text');
  perform pg_temp.check(public.submit_picks(v_game, v_host, 'rock', null, 'other', 'Indie')->>'status' = 'ok', 'picks can be changed');
  perform pg_temp.check((select count(*) from public.picks where game_id = v_game) = 2, 'changing picks keeps one row per member');
  perform pg_temp.check((select yes_other from public.picks where game_id = v_game and member_id = v_host) = 'Indie', 'changed picks are saved');
  begin
    perform public.submit_picks(v_game, v_b, 'pop', null, 'pop', null);
    raise exception 'FAILED: same tag as Yes and No was accepted';
  exception when check_violation then raise notice 'ok - same tag cannot be Yes and No';
  end;
  begin
    perform public.submit_picks(v_game, v_b, 'other', null, null, null);
    raise exception 'FAILED: Other without text was accepted';
  exception when check_violation then raise notice 'ok - Other needs text';
  end;

  -- Removing the last member who hasn't picked completes the picks
  perform public.remove_member(v_lobby, v_host, v_b);
  perform pg_temp.check((select stage from public.games where id = v_game) = 'searching', 'removing the last picker starts the search');
  perform pg_temp.check(public.submit_picks(v_game, v_a, 'pop', null, null, null)->>'status' = 'wrong_stage', 'no picks after the picks stage');

  -- "Change my picks" un-readies the member, so the search waits for them
  r := public.create_lobby('CHGX23', 'Host', 'dev-h5');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('CHGX23', 'Ana', 'dev-a5')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 0, 0)->>'game_id')::uuid;
  perform public.submit_picks(v_game, v_host, 'bbq', null, 'italian', null);
  perform pg_temp.check(public.unready_picks(v_game, v_host)->>'status' = 'ok', 'host taps Change my picks');
  perform pg_temp.check(not (select ready from public.picks where game_id = v_game and member_id = v_host), 'host is no longer done');
  perform pg_temp.check((select no_tag from public.picks where game_id = v_game and member_id = v_host) = 'bbq', 'previous picks are kept for pre-filling');
  perform pg_temp.check(public.submit_picks(v_game, v_a, 'pub', null, null, null)->>'stage' = 'picks', 'last other picker does not start the search while host is changing');
  perform pg_temp.check(public.submit_picks(v_game, v_host, 'seafood', null, null, null)->>'stage' = 'searching', 'host re-submitting starts the search');
  perform pg_temp.check(public.unready_picks(v_game, v_host)->>'status' = 'wrong_stage', 'too late to change once the search started');
  perform pg_temp.check((select ready from public.picks where game_id = v_game and member_id = v_host), 'picks stay ready after a late change attempt');

  -- Everyone picks
  r := public.create_lobby('PKXX23', 'Host', 'dev-h2');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('PKXX23', 'Ana', 'dev-a2')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'bars', null, 5, '21_plus', 'outdoor', 1::smallint, 0, 0)->>'game_id')::uuid;
  perform public.submit_picks(v_game, v_host, 'club', null, null, null);
  perform pg_temp.check(public.submit_picks(v_game, v_a, 'pub', null, 'rooftop', null)->>'stage' = 'searching', 'last pick starts the search');

  -- Leaving during picks
  r := public.create_lobby('LVXX23', 'Host', 'dev-h3');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('LVXX23', 'Ana', 'dev-a3')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 0, 0)->>'game_id')::uuid;
  perform public.submit_picks(v_game, v_a, 'bbq', null, null, null);
  perform public.leave_lobby(v_lobby, v_host);
  perform pg_temp.check((select host_member_id from public.lobbies where id = v_lobby) = v_a, 'host leaving mid-game passes host');
  perform pg_temp.check((select stage from public.games where id = v_game) = 'searching', 'host leaving without picking starts the search');

  -- Demo friends
  r := public.create_lobby('DMXX23', 'Host', 'dev-h4');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('DMXX23', 'Maya', 'dev-maya')->>'member_id')::uuid;
  perform pg_temp.check(public.add_demo_friends(v_lobby, v_a, array['Riley'])->>'status' = 'not_host', 'only the host adds demo friends');
  perform pg_temp.check(public.add_demo_friends(v_lobby, v_host, array['Maya', 'Jordan', 'Sam'])->>'status' = 'ok', 'host adds 3 demo friends');
  perform pg_temp.check((select count(*) from public.members where lobby_id = v_lobby and is_demo) = 3, 'three demo members');
  perform pg_temp.check(exists (select 1 from public.members where lobby_id = v_lobby and is_demo and name = 'Maya 2'), 'demo names avoid real names');
  perform pg_temp.check((select is_demo from public.lobbies where id = v_lobby), 'lobby becomes a demo lobby');
  update public.members set last_seen_at = now() - interval '1 hour' where lobby_id = v_lobby and is_demo;
  r := public.join_lobby('DMXX23', 'Jordan', 'dev-real-jordan');
  perform pg_temp.check(r->>'name' = 'Jordan 2' and not (r->>'rejoined')::boolean, 'a real person cannot take over a demo member');
  perform pg_temp.check(public.add_demo_friends(v_lobby, v_host, array['A','B','C','D','E'])->>'status' = 'full', 'demo friends respect the 10-member limit');
  perform public.leave_lobby(v_lobby, v_host);
  perform pg_temp.check((select host_member_id from public.lobbies where id = v_lobby) = v_a, 'a demo member never becomes host');
end $$;

-- Browser roles still can't call the new functions.
set role anon;
do $$
begin
  perform public.submit_picks(gen_random_uuid(), gen_random_uuid(), 'pop', null, null, null);
  raise exception 'FAILED: anon could call submit_picks';
exception when insufficient_privilege then raise notice 'ok - anon cannot call submit_picks';
end $$;
do $$
begin
  perform public.unready_picks(gen_random_uuid(), gen_random_uuid());
  raise exception 'FAILED: anon could call unready_picks';
exception when insufficient_privilege then raise notice 'ok - anon cannot call unready_picks';
end $$;
reset role;

do $$
declare
  r jsonb;
  v_lobby uuid; v_host uuid; v_a uuid; v_game uuid;
begin
  -- Both picks are optional (Nov 12, 2026)
  r := public.create_lobby('PKFR23', 'Free', 'dev-pk');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('PKFR23', 'Ana', 'dev-pk-a')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0)->>'game_id')::uuid;
  perform pg_temp.check(public.submit_picks(v_game, v_host, null, null, null, null)->>'status' = 'ok', 'a member can submit no picks at all');
  perform pg_temp.check(public.submit_picks(v_game, v_a, null, null, 'italian', null)->>'stage' = 'searching', 'a Yes without a No counts as done');
  begin
    insert into public.picks (game_id, member_id, no_tag, no_other) values (v_game, gen_random_uuid(), null, 'stray');
    raise exception 'FAILED: other text without an other No was accepted';
  exception when check_violation or foreign_key_violation then
    raise notice 'ok - other text needs an other No';
  end;
end $$;
