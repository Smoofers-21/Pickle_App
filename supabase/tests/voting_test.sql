-- Tests for voting and rounds (milestone 6).
-- Runs after all migrations; see supabase/README.md.

\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Puts n shown options into the game's current round and opens voting,
-- standing in for a finished search.
create or replace function pg_temp.fake_round(p_game uuid, p_round smallint, p_n int) returns uuid[]
language plpgsql as $$
declare ids uuid[];
begin
  with ins as (
    insert into public.options (game_id, shown_in_round, source, source_id, name, distance_mi, score)
    select p_game, p_round, 'geoapify', 'r' || p_round || '-' || i, 'Place ' || p_round || '-' || i, i, 80
    from generate_series(1, p_n) i
    returning id, source_id)
  select array_agg(id order by source_id) into ids from ins;
  update public.games set stage = 'cards_and_voting', current_round = p_round where id = p_game;
  return ids;
end $$;

do $$
declare
  r jsonb;
  v_lobby uuid; v_host uuid; v_a uuid; v_b uuid; v_game uuid;
  o uuid[]; f uuid[]; adv uuid[]; v_pings int;
begin
  -- A 2-round game with three people
  r := public.create_lobby('VTXX23', 'Host', 'dev-vh');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('VTXX23', 'Ana', 'dev-va')->>'member_id')::uuid;
  v_b := (public.join_lobby('VTXX23', 'Ben', 'dev-vb')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 2::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;

  perform pg_temp.check(public.submit_vote(v_game, v_host, 1::smallint, '{}')->>'status' = 'wrong_stage', 'no voting during picks');

  o := pg_temp.fake_round(v_game, 1::smallint, 4);

  -- Rankings must be exactly this round's options
  perform pg_temp.check(public.submit_vote(v_game, v_host, 1::smallint, o[1:3])->>'status' = 'invalid_ranking', 'a ranking must include every option');
  perform pg_temp.check(public.submit_vote(v_game, v_host, 1::smallint, array[o[1], o[1], o[2], o[3]])->>'status' = 'invalid_ranking', 'no option twice');
  perform pg_temp.check(public.submit_vote(v_game, v_host, 1::smallint, array[o[1], o[2], o[3], gen_random_uuid()])->>'status' = 'invalid_ranking', 'no foreign options');
  perform pg_temp.check(public.submit_vote(v_game, v_host, 0::smallint, o)->>'status' = 'wrong_stage', 'not the final yet');
  perform pg_temp.check(public.submit_vote(v_game, gen_random_uuid(), 1::smallint, o)->>'status' = 'not_member', 'only members vote');

  -- Forced tie: o1 and o2 both get 4+3+... points; o1 has more 1st places.
  --   host: o1 o2 o3 o4 -> o1 4, o2 3, o3 2, o4 1
  --   Ana:  o2 o1 o4 o3 -> o2 4, o1 3, o4 2, o3 1
  --   Ben:  o1 o3 o2 o4 -> o1 4, o3 3, o2 2, o4 1
  -- totals: o1 11 (2 firsts), o2 9, o3 6, o4 4
  select count(*) into v_pings from realtime.sent;
  r := public.submit_vote(v_game, v_host, 1::smallint, array[o[1], o[2], o[3], o[4]]);
  perform pg_temp.check(r->>'status' = 'ok' and r->>'stage' = 'cards_and_voting', 'first ranking: still voting');
  perform pg_temp.check((select count(*) from realtime.sent) > v_pings, 'a vote pings the lobby');
  perform pg_temp.check(public.submit_vote(v_game, v_a, 1::smallint, array[o[2], o[1], o[4], o[3]])->>'stage' = 'cards_and_voting', 'second ranking: still voting');

  -- Changing a ranking un-readies it
  perform pg_temp.check(public.unready_vote(v_game, v_a, 1::smallint)->>'status' = 'ok', 'Ana changes her ranking');
  perform pg_temp.check(public.submit_vote(v_game, v_b, 1::smallint, array[o[1], o[3], o[2], o[4]])->>'stage' = 'cards_and_voting',
                        'the round waits while Ana is changing');
  perform pg_temp.check(public.submit_vote(v_game, v_a, 1::smallint, array[o[2], o[1], o[4], o[3]])->>'stage' = 'round_complete',
                        'last ranking completes the round');

  perform pg_temp.check((select points from public.round_results where game_id = v_game and round_no = 1 and option_id = o[1]) = 11, 'o1 has 11 points');
  perform pg_temp.check((select points from public.round_results where game_id = v_game and round_no = 1 and option_id = o[2]) = 9, 'o2 has 9 points');
  perform pg_temp.check((select first_place_votes from public.round_results where game_id = v_game and round_no = 1 and option_id = o[1]) = 2, 'o1 has 2 first places');
  select array_agg(option_id order by place) into adv from public.round_results where game_id = v_game and round_no = 1 and advanced;
  perform pg_temp.check(adv = array[o[1], o[2]], 'top 2 advance in order');
  perform pg_temp.check(public.unready_vote(v_game, v_a, 1::smallint)->>'status' = 'wrong_stage', 'cannot change a ranking after the round ends');

  -- Only the host continues
  perform pg_temp.check(public.continue_after_round(v_lobby, v_a)->>'status' = 'not_host', 'only the host continues');
  r := public.continue_after_round(v_lobby, v_host);
  perform pg_temp.check(r->>'stage' = 'searching', 'round 2 starts with a search');
  perform pg_temp.check((select current_round from public.games where id = v_game) = 2, 'now round 2');
  perform pg_temp.check((select search from public.games where id = v_game) is null, 'the next search starts fresh');

  -- Round 2: a tie on points and first places is broken at random
  o := pg_temp.fake_round(v_game, 2::smallint, 2);
  perform public.submit_vote(v_game, v_host, 2::smallint, array[o[1], o[2]]);
  perform public.submit_vote(v_game, v_a, 2::smallint, array[o[2], o[1]]);
  -- Ben leaves without voting: the round ends with the two who are left.
  perform public.leave_lobby(v_lobby, v_b);
  perform pg_temp.check((select stage from public.games where id = v_game) = 'round_complete', 'leaving completes the round');
  perform pg_temp.check((select count(*) from public.round_results where game_id = v_game and round_no = 2 and advanced) = 2,
                        'both round 2 options advance');
  perform pg_temp.check((select array_agg(place order by place) from public.round_results where game_id = v_game and round_no = 2) = array[1, 2]::smallint[],
                        'a full tie still gets distinct places');

  -- Final vote among the 4 finalists
  perform pg_temp.check(public.continue_after_round(v_lobby, v_host)->>'stage' = 'final_vote', 'after the last round comes the final');
  f := public.ballot_options(v_game, 0::smallint);
  perform pg_temp.check(cardinality(f) = 4, 'four finalists');
  perform pg_temp.check(public.submit_vote(v_game, v_host, 0::smallint, f[1:2])->>'status' = 'invalid_ranking', 'the final ranks every finalist');
  perform public.submit_vote(v_game, v_host, 0::smallint, f);
  r := public.submit_vote(v_game, v_a, 0::smallint, f);
  perform pg_temp.check(r->>'stage' = 'results', 'the final vote ends in results');
  perform pg_temp.check((select option_id from public.round_results where game_id = v_game and round_no = 0 and place = 1) = f[1],
                        'the unanimous favourite wins');
  perform pg_temp.check((select points from public.round_results where game_id = v_game and round_no = 0 and place = 1) = 8, 'winner has 4+4 points');
  perform pg_temp.check(public.continue_after_round(v_lobby, v_host)->>'status' = 'wrong_stage', 'nothing to continue after results');

  -- A one-round game goes straight to results; departed members' votes don't count
  r := public.create_lobby('VTXX24', 'Solo', 'dev-vs');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('VTXX24', 'Ana', 'dev-vs-a')->>'member_id')::uuid;
  v_b := (public.join_lobby('VTXX24', 'Ben', 'dev-vs-b')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'bars', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;
  o := pg_temp.fake_round(v_game, 1::smallint, 3);
  perform public.submit_vote(v_game, v_b, 1::smallint, array[o[3], o[2], o[1]]);
  perform public.leave_lobby(v_lobby, v_b);
  perform public.submit_vote(v_game, v_host, 1::smallint, array[o[1], o[2], o[3]]);
  perform pg_temp.check(public.submit_vote(v_game, v_a, 1::smallint, array[o[1], o[3], o[2]])->>'stage' = 'results', 'one round: straight to results');
  perform pg_temp.check((select points from public.round_results where game_id = v_game and round_no = 1 and option_id = o[3]) = 3,
                        'a departed member''s ranking does not count');
  perform pg_temp.check(not exists (select 1 from public.round_results where game_id = v_game and advanced), 'nothing advances in a one-round game');

  -- Removing the last member who hasn't voted also ends the round
  r := public.create_lobby('VTXX25', 'Rem', 'dev-vr');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('VTXX25', 'Stuck', 'dev-vr-a')->>'member_id')::uuid;
  v_game := (public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;
  o := pg_temp.fake_round(v_game, 1::smallint, 2);
  perform public.submit_vote(v_game, v_host, 1::smallint, o);
  perform public.remove_member(v_lobby, v_host, v_a);
  perform pg_temp.check((select stage from public.games where id = v_game) = 'results', 'removing a stuck member ends the round');
end $$;
