-- Tests for Change lobby (milestone 7): everyone moves to a new code, the
-- old code ends, nothing carries over. Runs after all migrations.

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
  v_lobby uuid; v_host uuid; v_a uuid; v_b uuid; v_c uuid; v_game uuid;
  v_new uuid; v_new_host uuid; v_names text[]; v_pings int; v_code2 text;
  v_game2 uuid; v_new2 uuid;
begin
  r := public.create_lobby('CLXX23', 'Host', 'dev-ch');
  v_lobby := (r->>'lobby_id')::uuid; v_host := (r->>'member_id')::uuid;
  v_a := (public.join_lobby('CLXX23', 'Ana', 'dev-ca')->>'member_id')::uuid;
  v_b := (public.join_lobby('CLXX23', 'Ben', 'dev-cb')->>'member_id')::uuid;
  v_c := (public.join_lobby('CLXX23', 'Cy', 'dev-cc')->>'member_id')::uuid;
  perform public.add_demo_friends(v_lobby, v_host, array['Demo Dee'], 10);
  v_game := (public.start_game(v_lobby, v_host, 'food', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;
  insert into public.options (game_id, shown_in_round, source, source_id, name, distance_mi, score)
    values (v_game, 1, 'geoapify', 'cl-1', 'Place', 1, 80);

  -- Ben leaves and Cy is removed: neither moves.
  perform public.leave_lobby(v_lobby, v_b);
  perform public.remove_member(v_lobby, v_host, v_c);

  perform pg_temp.check(public.change_lobby(v_lobby, v_a, 'CLYY23')->>'status' = 'not_host', 'only the host changes the lobby');
  perform pg_temp.check(public.change_lobby(v_lobby, v_host, 'CLYY23')->>'status' = 'wrong_stage', 'only from the results');
  perform pg_temp.check(public.moved_lobby_code('CLXX23', 'dev-ch') is null, 'no move while the lobby is open');

  update public.games set stage = 'results' where id = v_game;
  perform pg_temp.check(public.change_lobby(v_lobby, v_host, 'CLXX23')->>'status' = 'code_taken', 'a taken code is refused');
  perform pg_temp.check((select status <> 'ended' and next_lobby_id is null from public.lobbies where id = v_lobby)
                        and exists (select 1 from public.games where id = v_game), 'a refused code changes nothing');

  select count(*) into v_pings from realtime.sent where topic = 'lobby:' || v_lobby;
  r := public.change_lobby(v_lobby, v_host, 'CLYY23');
  perform pg_temp.check(r->>'status' = 'ok' and r->>'code' = 'CLYY23', 'host changes the lobby');
  select id, host_member_id into v_new, v_new_host from public.lobbies where code = 'CLYY23';
  perform pg_temp.check(v_new_host = (r->>'member_id')::uuid, 'the result names the host''s new member row');

  -- The new lobby: open, same host, the same active people in the same order.
  perform pg_temp.check((select status = 'open' and current_game_id is null and is_demo from public.lobbies where id = v_new), 'new lobby is open with no game, still a demo lobby');
  perform pg_temp.check((select device_token_hash from public.members where id = v_new_host) = 'dev-ch', 'the host stays the host');
  select array_agg(name order by joined_at, id) into v_names from public.members where lobby_id = v_new;
  perform pg_temp.check(v_names = array['Host', 'Ana', 'Demo Dee'], 'active members move in joining order (not Ben, not Cy)');
  perform pg_temp.check((select is_demo from public.members where lobby_id = v_new and name = 'Demo Dee'), 'demo friends stay demo friends');

  -- The old lobby: ended, pointing at the new one, game and options gone.
  perform pg_temp.check((select status = 'ended' and next_lobby_id = v_new and current_game_id is null from public.lobbies where id = v_lobby), 'old lobby ends');
  perform pg_temp.check(not exists (select 1 from public.games where id = v_game)
                        and not exists (select 1 from public.options where game_id = v_game), 'nothing carries over');
  perform pg_temp.check((select count(*) from realtime.sent where topic = 'lobby:' || v_lobby) > v_pings, 'old lobby phones get a ping');
  perform pg_temp.check(public.join_lobby('CLXX23', 'Eve', 'dev-ce')->>'status' = 'not_found', 'the old code no longer works');
  perform pg_temp.check(public.join_lobby('CLXX23', 'Ana', 'dev-ca')->>'status' = 'not_found', 'not even for old members');

  -- Pressing it twice gives the same lobby.
  r := public.change_lobby(v_lobby, v_host, 'CLZZ23');
  perform pg_temp.check(r->>'status' = 'ok' and r->>'code' = 'CLYY23' and (r->>'member_id')::uuid = v_new_host, 'a second press gives the same new lobby');
  perform pg_temp.check(not exists (select 1 from public.lobbies where code = 'CLZZ23'), 'and makes no other lobby');

  -- Who the old code sends where.
  perform pg_temp.check(public.moved_lobby_code('CLXX23', 'dev-ch') = 'CLYY23', 'host is sent to the new code');
  perform pg_temp.check(public.moved_lobby_code('CLXX23', 'dev-ca') = 'CLYY23', 'a member is sent to the new code');
  perform pg_temp.check(public.moved_lobby_code('CLXX23', 'dev-cb') is null, 'someone who left is not told the new code');
  perform pg_temp.check(public.moved_lobby_code('CLXX23', 'dev-cc') is null, 'someone removed is not told the new code');
  perform pg_temp.check(public.moved_lobby_code('CLXX23', 'dev-stranger') is null, 'a stranger is not told the new code');
  perform pg_temp.check(public.moved_lobby_code('NOPE23', 'dev-ch') is null, 'unknown codes go nowhere');

  -- Leaving the new lobby stops the old code from leading there.
  perform public.leave_lobby(v_new, (select id from public.members where lobby_id = v_new and name = 'Ana'));
  perform pg_temp.check(public.moved_lobby_code('CLXX23', 'dev-ca') is null, 'leaving the new lobby ends the redirect');

  -- A second game and a second move: the first code follows both moves.
  v_game2 := (public.start_game(v_new, v_new_host, 'bars', null, 5, 'all', 'either', 1::smallint, 40.0, -74.0, 'America/New_York')->>'game_id')::uuid;
  update public.games set stage = 'results' where id = v_game2;
  r := public.change_lobby(v_new, v_new_host, 'CLWW23');
  perform pg_temp.check(r->>'status' = 'ok', 'a second game can change lobby too');
  select id into v_new2 from public.lobbies where code = 'CLWW23';
  perform pg_temp.check(public.moved_lobby_code('CLXX23', 'dev-ch') = 'CLWW23', 'the first code follows every move');
  perform pg_temp.check(public.moved_lobby_code('CLYY23', 'dev-ch') = 'CLWW23', 'so does the second');
  perform pg_temp.check((select count(*) from public.members where lobby_id = v_new2) = 2, 'only those still here move again');
end $$;

-- Only the server can call them.
do $$
begin
  perform pg_temp.check(not has_function_privilege('anon', 'public.change_lobby(uuid, uuid, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.change_lobby(uuid, uuid, text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.change_lobby(uuid, uuid, text)', 'EXECUTE'), 'change_lobby is server-only');
  perform pg_temp.check(not has_function_privilege('anon', 'public.moved_lobby_code(text, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.moved_lobby_code(text, text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.moved_lobby_code(text, text)', 'EXECUTE'), 'moved_lobby_code is server-only');
end $$;
