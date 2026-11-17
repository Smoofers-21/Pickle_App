-- Pickle: fixes from Codex's review of main (Nov 13, 2026)
--
-- 1. Rejoining after leaving. join_lobby lets a phone come back to its own
--    spot even after the game has started, as the Leave dialog promises, but
--    check_lobby_code (asked first, before the name step) said "locked", so
--    the phone never got as far as joining. It now gives the same answer
--    join_lobby would: a returning phone is "ok" in a locked lobby, and in
--    an open lobby only if there's room. A name still never gives anyone
--    else's spot.
--
-- 2. Location when a lobby ends. When the last real member leaves, the lobby
--    ends, but its game (with the host's rounded location) stayed until the
--    daily cleanup. An ended lobby can never be rejoined or searched again,
--    so its game and everything in it is deleted right away.

create or replace function public.check_lobby_code(p_code text, p_device_hash text, p_max_members integer default 10)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_mine public.members%rowtype;
  v_active integer;
  v_returning boolean;
begin
  select * into v_lobby from public.lobbies
  where code = p_code and status <> 'ended' and expires_at > now();
  if not found then return 'not_found'; end if;

  select * into v_mine from public.members
  where lobby_id = v_lobby.id and device_token_hash = p_device_hash
  order by joined_at desc limit 1;
  v_returning := found;
  if v_returning and v_mine.removed_at is not null then return 'removed'; end if;
  if v_returning and v_mine.left_at is null then return 'member'; end if;

  select count(*) into v_active from public.members
  where lobby_id = v_lobby.id and removed_at is null and left_at is null;

  -- This phone left earlier: it may come back, as join_lobby allows.
  if v_returning then
    if v_lobby.status = 'open' and v_active >= p_max_members then return 'full'; end if;
    return 'ok';
  end if;

  if v_lobby.status <> 'open' then return 'locked'; end if;
  if v_active >= p_max_members then return 'full'; end if;
  return 'ok';
end;
$$;

-- A demo member never becomes host (they can't run the game). With no real
-- member left, the lobby ends and its game (location included) is deleted.
create or replace function public.hand_over_host(p_lobby_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_next uuid;
  v_game uuid;
begin
  select m.id into v_next
  from public.members m
  where m.lobby_id = p_lobby_id and m.removed_at is null and m.left_at is null and not m.is_demo
  order by m.joined_at, m.id
  limit 1;

  if v_next is null then
    select l.current_game_id into v_game from public.lobbies l where l.id = p_lobby_id;
    update public.lobbies set host_member_id = null, status = 'ended', current_game_id = null
      where id = p_lobby_id;
    if v_game is not null then
      delete from public.games where id = v_game;
    end if;
  else
    update public.lobbies set host_member_id = v_next where id = p_lobby_id;
  end if;
  return v_next;
end;
$$;

revoke all on function public.check_lobby_code(text, text, integer) from public, anon, authenticated;
grant execute on function public.check_lobby_code(text, text, integer) to service_role;
revoke all on function public.hand_over_host(uuid) from public, anon, authenticated;
grant execute on function public.hand_over_host(uuid) to service_role;
