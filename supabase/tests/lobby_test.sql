-- Tests for the lobby functions. Runs on a local Postgres after
-- local-stubs.sql and the migrations (see supabase/README.md).
-- Any failed check raises an error and stops the run.

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
  v_lobby uuid;
  v_alex uuid; v_jordan uuid; v_sam uuid; v_sam2 uuid;
  v_count int;
begin
  -- Create
  r := public.create_lobby('Q7K2M9', 'Alex', 'dev-alex');
  v_lobby := (r->>'lobby_id')::uuid; v_alex := (r->>'member_id')::uuid;
  perform pg_temp.check((select host_member_id from public.lobbies where id = v_lobby) = v_alex, 'creator is host');
  perform pg_temp.check(public.create_lobby('Q7K2M9', 'X', 'dev-x')->>'error' = 'code_taken', 'duplicate code rejected');

  -- Code checks
  perform pg_temp.check(public.check_lobby_code('ZZZZZZ', 'dev-new') = 'not_found', 'unknown code: not_found');
  perform pg_temp.check(public.check_lobby_code('Q7K2M9', 'dev-new') = 'ok', 'open lobby: ok');
  perform pg_temp.check(public.check_lobby_code('Q7K2M9', 'dev-alex') = 'member', 'own lobby: member');

  -- Joins and duplicate names
  r := public.join_lobby('Q7K2M9', 'Jordan', 'dev-jordan'); v_jordan := (r->>'member_id')::uuid;
  perform pg_temp.check(r->>'status' = 'ok' and r->>'name' = 'Jordan', 'Jordan joins');
  r := public.join_lobby('Q7K2M9', 'Sam', 'dev-sam'); v_sam := (r->>'member_id')::uuid;
  r := public.join_lobby('Q7K2M9', 'sam', 'dev-sam2'); v_sam2 := (r->>'member_id')::uuid;
  perform pg_temp.check(r->>'name' = 'sam 2' and (r->>'renamed')::boolean, 'online duplicate name gets a number');
  r := public.join_lobby('Q7K2M9', 'Whoever', 'dev-sam');
  perform pg_temp.check((r->>'member_id')::uuid = v_sam and (r->>'rejoined')::boolean, 'same device rejoins as itself');

  -- Rejoin by name from a new device after going offline
  update public.members set last_seen_at = now() - interval '5 minutes' where id = v_sam;
  r := public.join_lobby('Q7K2M9', 'SAM', 'dev-sam-new-phone');
  perform pg_temp.check((r->>'member_id')::uuid = v_sam and r->>'name' = 'Sam', 'offline member rejoins by name from new device');
  perform pg_temp.check((select device_token_hash from public.members where id = v_sam) = 'dev-sam-new-phone', 'device moved to new phone');

  -- Remove
  perform pg_temp.check(public.remove_member(v_lobby, v_jordan, v_sam2)->>'status' = 'not_host', 'only host can remove');
  perform pg_temp.check(public.remove_member(v_lobby, v_alex, v_alex)->>'status' = 'cannot_remove_self', 'host cannot remove self');
  perform pg_temp.check(public.remove_member(v_lobby, v_alex, v_sam2)->>'status' = 'ok', 'host removes sam 2');
  perform pg_temp.check(public.join_lobby('Q7K2M9', 'sam 2', 'dev-sam2')->>'status' = 'removed', 'removed device cannot rejoin');
  perform pg_temp.check(public.check_lobby_code('Q7K2M9', 'dev-sam2') = 'removed', 'removed device sees removed');
  update public.members set last_seen_at = now() - interval '1 hour' where id = v_sam2;
  r := public.join_lobby('Q7K2M9', 'sam 2', 'dev-other');
  perform pg_temp.check((r->>'member_id')::uuid <> v_sam2 and r->>'name' = 'sam 2 2', 'removed member cannot be taken over by name');
  perform public.leave_lobby(v_lobby, (r->>'member_id')::uuid);

  -- Host leaves: earliest-joined active member becomes host
  perform public.leave_lobby(v_lobby, v_alex);
  perform pg_temp.check((select host_member_id from public.lobbies where id = v_lobby) = v_jordan, 'host passes to Jordan');
  r := public.join_lobby('Q7K2M9', 'Alex', 'dev-alex');
  perform pg_temp.check((r->>'member_id')::uuid = v_alex and (select host_member_id from public.lobbies where id = v_lobby) = v_jordan,
                        'Alex rejoins as a member, Jordan stays host');

  -- Capacity: 10 active members
  for i in 1..20 loop
    exit when (select count(*) from public.members where lobby_id = v_lobby and removed_at is null and left_at is null) >= 10;
    perform public.join_lobby('Q7K2M9', 'Guest ' || i, 'dev-guest-' || i);
  end loop;
  select count(*) into v_count from public.members where lobby_id = v_lobby and removed_at is null and left_at is null;
  perform pg_temp.check(v_count = 10, 'lobby holds 10');
  perform pg_temp.check(public.join_lobby('Q7K2M9', 'Late', 'dev-late')->>'status' = 'full', 'eleventh member: full');
  perform pg_temp.check(public.check_lobby_code('Q7K2M9', 'dev-late') = 'full', 'code check: full');

  -- Locked lobby: no newcomers, but an existing member can rejoin
  update public.lobbies set status = 'locked' where id = v_lobby;
  perform public.leave_lobby(v_lobby, (select id from public.members where lobby_id = v_lobby and name = 'Guest 1'));
  perform pg_temp.check(public.join_lobby('Q7K2M9', 'Late', 'dev-late')->>'status' = 'locked', 'locked: newcomer blocked');
  perform pg_temp.check(public.join_lobby('Q7K2M9', 'Jordan', 'dev-jordan')->>'status' = 'ok', 'locked: member rejoins');
  perform pg_temp.check(public.join_lobby('Q7K2M9', 'Guest 1', 'dev-guest-1')->>'status' = 'ok', 'locked: member who left rejoins');

  -- Everyone leaves: lobby ends
  update public.members set left_at = now() where lobby_id = v_lobby and id <> v_jordan;
  perform public.leave_lobby(v_lobby, v_jordan);
  perform pg_temp.check((select status from public.lobbies where id = v_lobby) = 'ended', 'empty lobby ends');
  perform pg_temp.check(public.check_lobby_code('Q7K2M9', 'dev-new') = 'not_found', 'ended lobby: not_found');

  -- Expired lobby
  r := public.create_lobby('ABCDEF', 'Old', 'dev-old');
  update public.lobbies set expires_at = now() - interval '1 minute' where code = 'ABCDEF';
  perform pg_temp.check(public.join_lobby('ABCDEF', 'Me', 'dev-me')->>'status' = 'not_found', 'expired lobby: not_found');

  -- Rate limit
  for i in 1..3 loop perform public.rate_limit_hit('test', 3, 60); end loop;
  perform pg_temp.check(not public.rate_limit_hit('test', 3, 60), 'fourth hit over a limit of 3 is blocked');
  update public.rate_limits set reset_at = now() - interval '1 second' where bucket = 'test';
  perform pg_temp.check(public.rate_limit_hit('test', 3, 60), 'limit resets after the window');

  -- Live update pings
  perform pg_temp.check((select count(*) from realtime.sent where topic = 'lobby:' || v_lobby and not private) > 5, 'changes ping the public lobby channel');
  select count(*) into v_count from realtime.sent;
  update public.members set last_seen_at = now() where lobby_id = v_lobby;
  perform pg_temp.check((select count(*) from realtime.sent) = v_count, 'heartbeats do not ping');
end $$;

-- Browser roles can read, write and call nothing.
set role anon;
do $$
begin
  begin
    perform 1 from public.members limit 1;
    raise exception 'FAILED: anon could read members';
  exception when insufficient_privilege then raise notice 'ok - anon cannot read members';
  end;
  begin
    perform public.join_lobby('Q7K2M9', 'Hacker', 'x');
    raise exception 'FAILED: anon could call join_lobby';
  exception when insufficient_privilege then raise notice 'ok - anon cannot call join_lobby';
  end;
end $$;
reset role;

set role authenticated;
do $$
begin
  begin
    insert into public.votes (game_id, round_no, member_id, ranking) values (gen_random_uuid(), 1, gen_random_uuid(), '{}');
    raise exception 'FAILED: authenticated could write votes';
  exception when insufficient_privilege then raise notice 'ok - authenticated cannot write votes';
  end;
end $$;
reset role;
