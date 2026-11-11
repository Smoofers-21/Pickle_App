-- Tests for the search functions (milestone 4). Runs after all migrations;
-- see supabase/README.md. Fixture changes roll back.

\set ON_ERROR_STOP 1
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

do $$
declare
  r jsonb;
  v_lobby uuid; v_host uuid; v_a uuid; v_game uuid;
  v_opt1 uuid; v_opt2 uuid;
  v_pings int;
begin
  -- Budget: atomic, capped, counts only
  perform pg_temp.check(public.reserve_api_units('geoapify', 5, 12), 'first request fits the budget');
  perform pg_temp.check(public.reserve_api_units('geoapify', 5, 12), 'second request fits the budget');
  perform pg_temp.check(not public.reserve_api_units('geoapify', 5, 12), 'a request that would pass the daily cap is refused');
  perform pg_temp.check((select units from public.api_usage where provider = 'geoapify') = 10, 'refused request spends nothing');
  perform pg_temp.check((select calls from public.api_usage where provider = 'geoapify') = 2
                        and (select refused from public.api_usage where provider = 'geoapify') = 1, 'call log counts calls and refusals');
  perform pg_temp.check(not public.reserve_api_units('ticketmaster', 0, 10), 'zero-unit reservations are refused');

  -- A game ready to search
  r := public.create_lobby('SRCH23', 'Host', 'dev-s-host');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('SRCH23', 'Ana', 'dev-s-a')->>'member_id')::uuid;
  r := public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 30.267, -97.743, 'America/Chicago');
  v_game := (r->>'game_id')::uuid;
  perform pg_temp.check((select time_zone from public.games where id = v_game) = 'America/Chicago', 'start_game saves the time zone');
  perform pg_temp.check(public.claim_search(v_game)->>'status' = 'not_searching', 'no search during picks');
  perform public.submit_picks(v_game, v_host, 'seafood', null, 'italian', null);
  perform public.submit_picks(v_game, v_a, 'bbq', null, null, null);
  perform pg_temp.check((select stage from public.games where id = v_game) = 'searching', 'all picks in: searching');

  -- Claiming
  r := public.claim_search(v_game);
  perform pg_temp.check(r->>'status' = 'ok' and (r->>'lat')::float = 30.267 and r->>'time_zone' = 'America/Chicago',
                        'claim returns what the search needs');
  perform pg_temp.check(public.claim_search(v_game)->>'status' = 'busy', 'a second server cannot claim a running search');
  update public.games set search_claimed_at = now() - interval '2 minutes' where id = v_game;
  perform pg_temp.check(public.claim_search(v_game)->>'status' = 'ok', 'a stale claim (crashed run) can be taken over');

  -- Progress pings, never the location
  select count(*) into v_pings from realtime.sent;
  perform public.search_progress(v_game, '{"radius_mi": 5, "matches": 4, "widened_to": 10}');
  perform pg_temp.check((select search->>'widened_to' from public.games where id = v_game) = '10', 'progress is saved');
  perform pg_temp.check((select count(*) from realtime.sent) > v_pings, 'progress pings the lobby');
  perform pg_temp.check((select search::text from public.games where id = v_game) not like '%30.267%', 'progress never holds the location');

  -- Saving the cache
  perform public.save_options(v_game, '[
    {"source":"geoapify","source_id":"p1","name":"Trattoria","normalized_name":"trattoria","distance_mi":0.5,"tags":["italian"],"details":{"kind":"Italian"}},
    {"source":"geoapify","source_id":"p2","name":"Taqueria","normalized_name":"taqueria","distance_mi":1.2,"link":"https://example.com"}]');
  perform public.save_options(v_game, '[{"source":"geoapify","source_id":"p1","name":"Changed"}]');
  perform pg_temp.check((select count(*) from public.options where game_id = v_game) = 2, 'saving the same place twice keeps one row');
  perform pg_temp.check((select name from public.options where game_id = v_game and source_id = 'p1') = 'Trattoria', 'saved places are not overwritten');
  select id into v_opt1 from public.options where game_id = v_game and source_id = 'p1';
  select id into v_opt2 from public.options where game_id = v_game and source_id = 'p2';

  -- Finishing
  r := public.finish_search(v_game, 'done', '{"radius_mi":5,"matches":1}', jsonb_build_array(jsonb_build_object('id', v_opt1, 'score', 83)));
  perform pg_temp.check(r->>'status' = 'ok', 'search finishes');
  perform pg_temp.check((select stage from public.games where id = v_game) = 'cards_and_voting', 'done moves everyone to the cards');
  perform pg_temp.check((select shown_in_round from public.options where id = v_opt1) = 1
                        and (select score from public.options where id = v_opt1) = 83, 'chosen option is shown in round 1 with its score');
  perform pg_temp.check((select shown_in_round from public.options where id = v_opt2) is null, 'unchosen options stay in the cache');
  perform pg_temp.check((select center_lat is null and center_lng is null from public.games where id = v_game),
                        'location is deleted after the last search of a 1-round game');
  perform pg_temp.check(public.finish_search(v_game, 'done', '{}', jsonb_build_array(jsonb_build_object('id', v_opt2, 'score', 70)))->>'status' = 'stale',
                        'a late second finish is ignored');

  -- Nothing found, then the host changes the criteria
  r := public.create_lobby('NFND23', 'Hana', 'dev-n-host');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('NFND23', 'Abe', 'dev-n-a')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'bars', null, 1, '21_plus', 'either', 2::smallint, 30.2, -97.7, null)->>'game_id')::uuid;
  perform public.submit_picks(v_game, v_host, 'pub', null, null, null);
  perform public.submit_picks(v_game, v_a, 'club', null, null, null);
  perform public.claim_search(v_game);
  perform public.save_options(v_game, '[{"source":"geoapify","source_id":"x1","name":"Far Bar"}]');
  perform public.finish_search(v_game, 'nothing_found', '{"radius_mi":1,"widened_to":6,"matches":0}');
  perform pg_temp.check((select stage from public.games where id = v_game) = 'searching'
                        and (select search->>'status' from public.games where id = v_game) = 'nothing_found', 'nothing found waits for the host');
  perform pg_temp.check((select center_lat from public.games where id = v_game) is null, 'location is deleted after the last search even when nothing was found');
  perform pg_temp.check(public.claim_search(v_game)->>'status' = 'finished', 'a finished search is not run again');

  perform pg_temp.check(public.change_criteria(v_game, v_a, 'bars', null, 5, '21_plus', 'either', 2::smallint, 30.2, -97.7, null)->>'status' = 'not_host',
                        'only the host changes the criteria');
  r := public.change_criteria(v_game, v_host, 'bars', null, 10, '21_plus', 'either', 2::smallint, 30.21, -97.71, 'America/Chicago');
  perform pg_temp.check(r->>'status' = 'ok', 'host changes the criteria');
  perform pg_temp.check((select stage from public.games where id = v_game) = 'searching'
                        and (select search from public.games where id = v_game) is null
                        and (select radius_mi from public.games where id = v_game) = 10, 'same category: search runs again with the new radius');
  perform pg_temp.check((select count(*) from public.picks where game_id = v_game) = 2, 'same category keeps everyone''s picks');
  perform pg_temp.check((select count(*) from public.options where game_id = v_game) = 0, 'old results are cleared');
  perform pg_temp.check(public.change_criteria(v_game, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 30.2, -97.7, null)->>'status' = 'wrong_stage',
                        'criteria change only after a failed search');

  perform public.claim_search(v_game);
  perform public.finish_search(v_game, 'unavailable', '{"reason":"budget"}');
  r := public.change_criteria(v_game, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 30.2, -97.7, null);
  perform pg_temp.check((select stage from public.games where id = v_game) = 'picks'
                        and (select count(*) from public.picks where game_id = v_game) = 0, 'new category: everyone picks again');

  -- Ending the game
  perform pg_temp.check(public.end_game(v_lobby, v_a)->>'status' = 'not_host', 'only the host ends the game');
  perform pg_temp.check(public.end_game(v_lobby, v_host)->>'status' = 'ok', 'host ends the game');
  perform pg_temp.check(not exists (select 1 from public.games where id = v_game), 'ending deletes the game and its data');
  perform pg_temp.check((select status = 'open' and current_game_id is null from public.lobbies where id = v_lobby), 'lobby opens for a new game');
  perform pg_temp.check(public.end_game(v_lobby, v_host)->>'status' = 'no_game', 'nothing to end twice');
end $$;

rollback;
