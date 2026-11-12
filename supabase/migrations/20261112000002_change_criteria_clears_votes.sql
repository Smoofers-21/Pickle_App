-- Pickle: changing the criteria clears earlier rankings (milestone 6 review).
--
-- "Change criteria" (after a search finds nothing) restarts the game at
-- round 1 and deletes the saved options. In a later round, the old rankings
-- stayed: members looked "done" in the new round 1 and its votes could be
-- counted early. Now the rankings and round results are deleted too.
-- Same signature and behaviour otherwise; only the server may call it.

create or replace function public.change_criteria(
  p_game_id uuid, p_host_member_id uuid,
  p_category text, p_event_date date, p_radius_mi numeric, p_age text,
  p_indoor_outdoor text, p_rounds smallint, p_lat double precision, p_lng double precision,
  p_time_zone text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_host uuid;
  v_lobby_id uuid;
begin
  -- Match leave/end lock order: lobby first, then game. This also
  -- serializes host handover with the host authorization check.
  select lobby_id into v_lobby_id from public.games where id = p_game_id;
  select host_member_id into v_host from public.lobbies
    where id = v_lobby_id and current_game_id = p_game_id
      and status = 'locked' and expires_at > now() for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_host is distinct from p_host_member_id then
    return jsonb_build_object('status', 'not_host');
  end if;
  if v_game.stage <> 'searching' or coalesce(v_game.search->>'status', '') not in ('nothing_found', 'unavailable') then
    return jsonb_build_object('status', 'wrong_stage');
  end if;

  -- The game restarts at round 1: earlier rounds' rankings and results go
  -- too, or old "done" rankings would count in the new round.
  delete from public.votes where game_id = p_game_id;
  delete from public.round_results where game_id = p_game_id;
  delete from public.options where game_id = p_game_id;
  if p_category <> v_game.category then
    delete from public.picks where game_id = p_game_id;
  end if;
  update public.games
    set category = p_category,
        event_date = case when p_category = 'events' then p_event_date end,
        radius_mi = p_radius_mi, age = p_age, indoor_outdoor = p_indoor_outdoor,
        rounds_total = p_rounds, current_round = 1,
        center_lat = p_lat, center_lng = p_lng, time_zone = p_time_zone,
        search = null, search_claimed_at = null, search_claim_token = null,
        stage = case when p_category <> v_game.category then 'picks' else 'searching' end
    where id = p_game_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.change_criteria(uuid, uuid, text, date, numeric, text, text, smallint, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.change_criteria(uuid, uuid, text, date, numeric, text, text, smallint, double precision, double precision, text)
  to service_role;
