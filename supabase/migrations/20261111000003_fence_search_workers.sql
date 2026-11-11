-- Search ownership fencing. Apply after the milestone 4 migration, then
-- deploy the matching application code. Existing migrations stay unchanged.
-- Old tokenless worker writes are rejected; stale searches can be reclaimed.
begin;
alter table public.games add column search_claim_token uuid;

-- Consistent lock order for every worker mutation: lobby, then game.
-- Ending a lobby/game or handing over the host cannot race this check.
create function public.lock_search_claim(p_game_id uuid, p_claim_token uuid)
returns boolean language plpgsql set search_path = '' as $$
declare v_lobby uuid;
begin
  if p_claim_token is null then return false; end if;
  select lobby_id into v_lobby from public.games where id = p_game_id;
  perform 1 from public.lobbies where id = v_lobby and current_game_id = p_game_id
    and status = 'locked' and expires_at > now() for update;
  if not found then return false; end if;
  perform 1 from public.games where id = p_game_id and stage = 'searching'
    and search->>'status' = 'running' and search_claim_token = p_claim_token for update;
  return found;
end;
$$;

-- Drop tokenless overloads so PostgREST cannot select an unfenced RPC.
drop function public.search_progress(uuid, jsonb);
drop function public.save_options(uuid, jsonb);
drop function public.finish_search(uuid, text, jsonb, jsonb);

create or replace function public.claim_search(p_game_id uuid, p_stale_seconds integer default 45)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_game public.games%rowtype; v_lobby uuid;
begin
  select lobby_id into v_lobby from public.games where id = p_game_id;
  perform 1 from public.lobbies where id = v_lobby and current_game_id = p_game_id
    and status = 'locked' and expires_at > now() for update;
  if not found then return jsonb_build_object('status', 'not_searching'); end if;
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.stage <> 'searching' or not exists (
    select 1 from public.lobbies l where l.id = v_game.lobby_id and l.current_game_id = p_game_id
      and l.status = 'locked' and l.expires_at > now()) then
    return jsonb_build_object('status', 'not_searching');
  end if;
  if v_game.search is not null and (v_game.search->>'round')::int = v_game.current_round then
    if v_game.search->>'status' <> 'running' then
      return jsonb_build_object('status', 'finished');
    end if;
    if v_game.search_claimed_at > now() - make_interval(secs => p_stale_seconds) then
      return jsonb_build_object('status', 'busy');
    end if;
  end if;
  if v_game.center_lat is null or v_game.center_lng is null then
    update public.games
      set search = jsonb_build_object('round', v_game.current_round, 'status', 'nothing_found',
                                      'radius_mi', v_game.radius_mi, 'reason', 'no_location')
      where id = p_game_id;
    return jsonb_build_object('status', 'finished');
  end if;

  update public.games
    set search = jsonb_build_object('round', v_game.current_round, 'status', 'running', 'radius_mi', v_game.radius_mi),
        search_claimed_at = now(), search_claim_token = gen_random_uuid()
    where id = p_game_id;
  return jsonb_build_object(
    'status', 'ok', 'claim_token', (select search_claim_token from public.games where id = p_game_id),
    'is_demo', (select is_demo from public.lobbies where id = v_game.lobby_id),
    'active_member_ids', (select coalesce(jsonb_agg(m.id), '[]'::jsonb) from public.members m
      where m.lobby_id = v_game.lobby_id and m.removed_at is null and m.left_at is null), 'round', v_game.current_round, 'rounds_total', v_game.rounds_total,
    'category', v_game.category, 'event_date', v_game.event_date, 'radius_mi', v_game.radius_mi,
    'age', v_game.age, 'indoor_outdoor', v_game.indoor_outdoor, 'time_zone', v_game.time_zone,
    'lat', v_game.center_lat, 'lng', v_game.center_lng);
end;
$$;

create or replace function public.search_progress(p_game_id uuid, p_search jsonb, p_claim_token uuid default null)
returns boolean
language plpgsql
set search_path = ''
as $$
declare v_updated boolean;
begin
  if not public.lock_search_claim(p_game_id, p_claim_token) then return false; end if;
  update public.games
    set search = p_search || jsonb_build_object('round', current_round, 'status', 'running'),
        search_claimed_at = now()
    where id = p_game_id and stage = 'searching' and search->>'status' = 'running' and search_claim_token = p_claim_token
    returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;

create or replace function public.save_options(p_game_id uuid, p_options jsonb, p_claim_token uuid default null)
returns table (option_id uuid, option_source text, option_source_id text)
language plpgsql
set search_path = ''
as $$
declare v_game public.games%rowtype;
begin
  if not public.lock_search_claim(p_game_id, p_claim_token) then return; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if not found or p_claim_token is null or v_game.search_claim_token is distinct from p_claim_token
     or v_game.stage <> 'searching' or v_game.search->>'status' is distinct from 'running' then
    return;
  end if;
  insert into public.options (game_id, source, source_id, name, normalized_name, address,
                              tags, start_time, distance_mi, link, details)
  select p_game_id, o->>'source', o->>'source_id', left(o->>'name', 100), left(o->>'normalized_name', 100),
         left(o->>'address', 200),
         coalesce(array(select jsonb_array_elements_text(o->'tags')), '{}'),
         nullif(o->>'start_time', '')::timestamptz, least((o->>'distance_mi')::numeric, 999),
         left(o->>'link', 500), coalesce(o->'details', '{}')
  from jsonb_array_elements(p_options) o
  on conflict (game_id, source, source_id) do nothing;

  return query select x.id, x.source, x.source_id from public.options x where x.game_id = p_game_id;
end;
$$;

create or replace function public.finish_search(
  p_game_id uuid, p_status text, p_search jsonb, p_chosen jsonb default '[]', p_claim_token uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_last boolean;
begin
  if p_status not in ('done', 'nothing_found', 'unavailable') then
    raise exception 'bad status %', p_status;
  end if;
  if not public.lock_search_claim(p_game_id, p_claim_token) then
    return jsonb_build_object('status', 'stale');
  end if;
  select * into v_game from public.games where id = p_game_id for update;
  if not found or p_claim_token is null or v_game.search_claim_token is distinct from p_claim_token or v_game.stage <> 'searching' or v_game.search->>'status' is distinct from 'running' then
    return jsonb_build_object('status', 'stale');
  end if;
  if p_status = 'done' and (jsonb_array_length(p_chosen) not between 1 and 6 or
    (select count(distinct o.id) from public.options o join jsonb_array_elements(p_chosen) c
      on o.id = (c->>'id')::uuid where o.game_id = p_game_id and o.shown_in_round is null
      and (c->>'score')::numeric between 0 and 100) <> jsonb_array_length(p_chosen)) then
    return jsonb_build_object('status', 'invalid_options');
  end if;

  update public.options o
    set shown_in_round = v_game.current_round, score = (c->>'score')::numeric
    from jsonb_array_elements(p_chosen) c
    where o.game_id = p_game_id and o.id = (c->>'id')::uuid and o.shown_in_round is null;

  -- Delete the location after the game's last search, and after any failed
  -- search (changing the criteria sends a fresh one).
  v_last := v_game.current_round >= v_game.rounds_total or p_status <> 'done';
  update public.games
    set search_claim_token = null, search_claimed_at = null, search = p_search || jsonb_build_object('round', v_game.current_round, 'status', p_status),
        stage = case when p_status = 'done' then 'cards_and_voting' else stage end,
        center_lat = case when v_last then null else center_lat end,
        center_lng = case when v_last then null else center_lng end
    where id = p_game_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

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


-- A stale worker must not spend credits for a later search. Lock the game
-- and validate ownership before reserving the shared budget.
create or replace function public.reserve_search_units(
  p_game_id uuid, p_claim_token uuid, p_provider text, p_units integer, p_daily_cap integer)
returns text language plpgsql set search_path = '' as $$
declare v_game public.games%rowtype;
begin
  if not public.lock_search_claim(p_game_id, p_claim_token) then return 'stale'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if not found or p_claim_token is null or v_game.search_claim_token is distinct from p_claim_token
     or v_game.stage <> 'searching' or v_game.search->>'status' is distinct from 'running'
     or p_provider is distinct from (case when v_game.category = 'events' then 'ticketmaster' else 'geoapify' end)
     or not exists (select 1 from public.lobbies l where l.id = v_game.lobby_id
       and l.current_game_id = p_game_id and l.status = 'locked' and l.expires_at > now()) then
    return 'stale';
  end if;
  if p_units is null or p_daily_cap is null or p_daily_cap < 1 then return 'budget'; end if;
  if not public.reserve_api_units(p_provider, p_units, p_daily_cap) then return 'budget'; end if;
  return 'ok';
end;
$$;


do $$ declare f text; begin
  foreach f in array array[
    'lock_search_claim(uuid, uuid)',
    'claim_search(uuid, integer)',
    'search_progress(uuid, jsonb, uuid)',
    'save_options(uuid, jsonb, uuid)',
    'finish_search(uuid, text, jsonb, jsonb, uuid)',
    'reserve_search_units(uuid, uuid, text, integer, integer)',
    'change_criteria(uuid, uuid, text, date, numeric, text, text, smallint, double precision, double precision, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
