-- Pickle: Change lobby (milestone 7, screens 16 and 17)
--
-- From the results screen, the host starts a new lobby. Everyone still in the
-- lobby moves to a new code together, in the same order, with the same host.
-- The old code stops working at once and the finished game is deleted with
-- everything in it (options, picks, votes, results): nothing carries over.
--
-- Phones still on the old code ask moved_lobby_code(), which tells a phone
-- the new code only if that phone is an active member of the new lobby.

-- Returns {status: ok, code, member_id} (the new lobby's code and the host's
-- new member row), or not_found / not_host / wrong_stage / code_taken.
-- Pressing it twice gives the same new lobby.
create or replace function public.change_lobby(p_lobby_id uuid, p_host_member_id uuid, p_code text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_stage text;
  v_new uuid;
  v_new_code text;
  v_host uuid;
  v_id uuid;
  m public.members%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  if not found or v_lobby.expires_at <= now() then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_lobby.host_member_id is distinct from p_host_member_id then
    return jsonb_build_object('status', 'not_host');
  end if;

  -- Already moved (a double tap, or a retry after a lost response).
  if v_lobby.next_lobby_id is not null then
    select l.code into v_new_code from public.lobbies l
    where l.id = v_lobby.next_lobby_id and l.status <> 'ended' and l.expires_at > now();
    select m2.id into v_host from public.members m2
    where m2.lobby_id = v_lobby.next_lobby_id
      and m2.device_token_hash = (select device_token_hash from public.members where id = p_host_member_id)
      and m2.removed_at is null and m2.left_at is null;
    if v_new_code is null or v_host is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    return jsonb_build_object('status', 'ok', 'code', v_new_code, 'member_id', v_host);
  end if;

  if v_lobby.status = 'ended' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select g.stage into v_stage from public.games g where g.id = v_lobby.current_game_id;
  if v_stage is distinct from 'results' then
    return jsonb_build_object('status', 'wrong_stage');
  end if;

  begin
    insert into public.lobbies (code, is_demo) values (p_code, v_lobby.is_demo) returning id into v_new;
  exception when unique_violation then
    return jsonb_build_object('status', 'code_taken');
  end;

  -- Same people, same order (the host role passes by joining order).
  for m in
    select * from public.members
    where lobby_id = p_lobby_id and removed_at is null and left_at is null
    order by joined_at, id
  loop
    insert into public.members (lobby_id, name, device_token_hash, joined_at, is_demo, last_seen_at)
      values (v_new, m.name, m.device_token_hash, m.joined_at, m.is_demo, m.last_seen_at)
      returning id into v_id;
    if m.id = p_host_member_id then v_host := v_id; end if;
  end loop;
  update public.lobbies set host_member_id = v_host where id = v_new;

  -- Nothing carries over: the finished game goes, and the old code ends.
  -- Ending the old lobby pings its phones, which then move.
  delete from public.games where id = v_lobby.current_game_id;
  update public.lobbies
    set status = 'ended', current_game_id = null, next_lobby_id = v_new
    where id = p_lobby_id;

  return jsonb_build_object('status', 'ok', 'code', p_code, 'member_id', v_host);
end;
$$;

-- Where a phone on an ended lobby's code went: the code of the lobby the
-- group moved to (following a few moves), but only when this device is an
-- active member there. Otherwise null, and the phone sees "This lobby has
-- ended".
create or replace function public.moved_lobby_code(p_code text, p_device_hash text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_status text;
  v_next uuid;
  v_hops integer := 0;
begin
  select l.next_lobby_id into v_id from public.lobbies l
  where l.code = p_code and l.status = 'ended' and l.expires_at > now();

  while v_id is not null and v_hops < 5 loop
    select l.code, l.status, l.next_lobby_id into v_code, v_status, v_next
    from public.lobbies l where l.id = v_id and l.expires_at > now();
    if not found then
      return null;
    end if;
    if v_status <> 'ended' then
      if exists (select 1 from public.members m
                 where m.lobby_id = v_id and m.device_token_hash = p_device_hash
                   and m.removed_at is null and m.left_at is null) then
        return v_code;
      end if;
      return null;
    end if;
    v_id := v_next;
    v_hops := v_hops + 1;
  end loop;
  return null;
end;
$$;

revoke all on function public.change_lobby(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.change_lobby(uuid, uuid, text) to service_role;
revoke all on function public.moved_lobby_code(text, text) from public, anon, authenticated;
grant execute on function public.moved_lobby_code(text, text) to service_role;
