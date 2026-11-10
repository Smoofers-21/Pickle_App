-- Pickle: a name is never proof of who you are (security review, milestone 3)
--
-- Before: joining with the name of a member who had left, or had been
-- offline for 75 seconds, from a different phone moved that member's spot
-- (and their host role and picks) to the new phone. Anyone in the lobby
-- could wait for the host to go offline and take over as host.
--
-- Now a spot only ever goes back to the phone (device cookie) that owns it.
-- A different phone using a taken name joins as a new member ("Sam 2"), and
-- the host can remove the old spot. Decided Nov 10, 2026 (option A).

create or replace function public.join_lobby(
  p_code text, p_name text, p_device_hash text,
  p_max_members integer default 10, p_stale_seconds integer default 75)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_member public.members%rowtype;
  v_active integer;
  v_name text;
begin
  select * into v_lobby from public.lobbies
  where code = p_code and status <> 'ended' and expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 1. This device is already a member.
  select * into v_member from public.members
  where lobby_id = v_lobby.id and device_token_hash = p_device_hash
  order by joined_at desc limit 1;
  if found then
    if v_member.removed_at is not null then
      return jsonb_build_object('status', 'removed');
    end if;
    if v_member.left_at is not null then
      if v_lobby.status = 'open' then
        select count(*) into v_active from public.members
        where lobby_id = v_lobby.id and removed_at is null and left_at is null;
        if v_active >= p_max_members then
          return jsonb_build_object('status', 'full');
        end if;
      end if;
      update public.members set left_at = null, last_seen_at = now() where id = v_member.id;
      if v_lobby.host_member_id is null then
        perform public.hand_over_host(v_lobby.id);
      end if;
    end if;
    return jsonb_build_object('status', 'ok', 'member_id', v_member.id, 'name', v_member.name,
                              'renamed', false, 'rejoined', true);
  end if;

  -- 2. A new member. A taken name gets a number ("Sam 2"); a name never
  --    gives access to someone else's spot.
  if v_lobby.status <> 'open' then
    return jsonb_build_object('status', 'locked');
  end if;
  select count(*) into v_active from public.members
  where lobby_id = v_lobby.id and removed_at is null and left_at is null;
  if v_active >= p_max_members then
    return jsonb_build_object('status', 'full');
  end if;

  v_name := public.next_free_name(v_lobby.id, p_name);
  insert into public.members (lobby_id, name, device_token_hash)
    values (v_lobby.id, v_name, p_device_hash)
    returning * into v_member;
  return jsonb_build_object('status', 'ok', 'member_id', v_member.id, 'name', v_name,
                            'renamed', v_name <> p_name, 'rejoined', false);
end;
$$;

revoke all on function public.join_lobby(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.join_lobby(text, text, text, integer, integer) to service_role;
