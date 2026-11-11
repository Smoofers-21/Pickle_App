-- Pickle: search with real data (milestone 4)
--
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Needs every earlier migration to have been run first.
--
-- Adds: the game's time zone (for "open now"), search progress, card details
-- on saved options, a shared daily API budget that doubles as the call log,
-- and the functions that claim, save and finish a search, change the
-- criteria after "nothing found", and end a game.

-- ---------------------------------------------------------------------------
-- Table changes
-- ---------------------------------------------------------------------------

alter table public.games
  add column time_zone text check (char_length(time_zone) <= 64),
  -- Search progress for screens 10 and 11. Never holds the location.
  -- {round, status: running|done|nothing_found|unavailable, radius_mi,
  --  matches, widened_to, reason}
  add column search jsonb,
  add column search_claimed_at timestamptz;

alter table public.options
  add column address text check (char_length(address) <= 200),
  -- Everything the card and later rounds need (a scoring Candidate, minus
  -- nothing private: it describes the place or event, not the group).
  add column details jsonb not null default '{}';

-- One row per day and provider: credits (Geoapify) or calls (Ticketmaster)
-- used. Holds counts only: no locations, keys or request URLs.
create table public.api_usage (
  day       date not null,
  provider  text not null check (provider in ('geoapify', 'ticketmaster')),
  units     integer not null default 0,
  calls     integer not null default 0,
  refused   integer not null default 0,
  primary key (day, provider)
);
alter table public.api_usage enable row level security;
alter table public.api_usage force row level security;
revoke all on public.api_usage from anon, authenticated;
grant select, insert, update, delete on public.api_usage to service_role;

-- Pings for search progress too, so every phone sees each step.
drop trigger games_changed on public.games;
create trigger games_changed
  after insert or update of stage, current_round, search on public.games
  for each row execute function public.on_game_row_changed();

-- ---------------------------------------------------------------------------
-- API budget
-- ---------------------------------------------------------------------------

-- Reserves `p_units` for one request before it is sent. Atomic across every
-- server instance: returns false (and sends nothing) once the day's cap would
-- be passed. The day is UTC, like Geoapify's daily quota.
create or replace function public.reserve_api_units(p_provider text, p_units integer, p_daily_cap integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare v_ok boolean;
begin
  if p_units < 1 or p_units > p_daily_cap then
    return false;
  end if;
  insert into public.api_usage as u (day, provider, units, calls)
  values ((now() at time zone 'utc')::date, p_provider, p_units, 1)
  on conflict (day, provider) do update
    set units = u.units + p_units, calls = u.calls + 1
    where u.units + p_units <= p_daily_cap
  returning true into v_ok;
  if v_ok is null then
    update public.api_usage set refused = refused + 1
      where day = (now() at time zone 'utc')::date and provider = p_provider;
    return false;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

-- Claims the current round's search so only one server runs it. A claim
-- older than p_stale_seconds (a crashed run) can be taken over.
create or replace function public.claim_search(p_game_id uuid, p_stale_seconds integer default 45)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.stage <> 'searching' then
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
        search_claimed_at = now()
    where id = p_game_id;
  return jsonb_build_object(
    'status', 'ok', 'round', v_game.current_round, 'rounds_total', v_game.rounds_total,
    'category', v_game.category, 'event_date', v_game.event_date, 'radius_mi', v_game.radius_mi,
    'age', v_game.age, 'indoor_outdoor', v_game.indoor_outdoor, 'time_zone', v_game.time_zone,
    'lat', v_game.center_lat, 'lng', v_game.center_lng);
end;
$$;

-- Progress for screen 10 (only while this round's search is still running).
create or replace function public.search_progress(p_game_id uuid, p_search jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.games
    set search = p_search || jsonb_build_object('round', current_round, 'status', 'running'),
        search_claimed_at = now()
    where id = p_game_id and stage = 'searching' and search->>'status' = 'running';
end;
$$;

-- Saves search results (the game's cache). Places already saved are kept as
-- they are. Returns every saved option's id with its source and source id.
create or replace function public.save_options(p_game_id uuid, p_options jsonb)
returns table (option_id uuid, option_source text, option_source_id text)
language plpgsql
set search_path = ''
as $$
begin
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

-- Ends this round's search. 'done': marks the chosen options as shown in
-- this round (with their hidden scores) and moves everyone to the cards.
-- 'nothing_found' / 'unavailable': stays on searching for the host to
-- choose (screen 11). The host's location is deleted after the game's last
-- search (always after round 1 in a 1-round game) and after a failed search.
create or replace function public.finish_search(
  p_game_id uuid, p_status text, p_search jsonb, p_chosen jsonb default '[]')
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
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.stage <> 'searching' or v_game.search->>'status' is distinct from 'running' then
    return jsonb_build_object('status', 'stale');
  end if;
  if p_status = 'done' and jsonb_array_length(p_chosen) = 0 then
    raise exception 'done needs options';
  end if;

  update public.options o
    set shown_in_round = v_game.current_round, score = (c->>'score')::numeric
    from jsonb_array_elements(p_chosen) c
    where o.game_id = p_game_id and o.id = (c->>'id')::uuid and o.shown_in_round is null;

  -- Delete the location after the game's last search, and after any failed
  -- search (changing the criteria sends a fresh one).
  v_last := v_game.current_round >= v_game.rounds_total or p_status <> 'done';
  update public.games
    set search = p_search || jsonb_build_object('round', v_game.current_round, 'status', p_status),
        stage = case when p_status = 'done' then 'cards_and_voting' else stage end,
        center_lat = case when v_last then null else center_lat end,
        center_lng = case when v_last then null else center_lng end
    where id = p_game_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- After "nothing found", the host changes the criteria (screen 11 → 07).
-- Same category: everyone's picks are kept and the search runs again.
-- New category: the old picks no longer apply, so everyone picks again.
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
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select host_member_id into v_host from public.lobbies where id = v_game.lobby_id;
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
        search = null, search_claimed_at = null,
        stage = case when p_category <> v_game.category then 'picks' else 'searching' end
    where id = p_game_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- The host ends the game: the game and everything in it (picks, options,
-- location) is deleted, and the lobby opens again for a new game.
create or replace function public.end_game(p_lobby_id uuid, p_host_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  if not found or v_lobby.status = 'ended' then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_lobby.host_member_id is distinct from p_host_member_id then
    return jsonb_build_object('status', 'not_host');
  end if;
  if v_lobby.current_game_id is null then
    return jsonb_build_object('status', 'no_game');
  end if;
  delete from public.games where id = v_lobby.current_game_id;
  update public.lobbies set status = 'open', current_game_id = null where id = p_lobby_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- start_game now also saves the host's time zone (for "open now").
drop function public.start_game(uuid, uuid, text, date, numeric, text, text, smallint, double precision, double precision);
create or replace function public.start_game(
  p_lobby_id uuid, p_host_member_id uuid,
  p_category text, p_event_date date, p_radius_mi numeric, p_age text,
  p_indoor_outdoor text, p_rounds smallint, p_lat double precision, p_lng double precision,
  p_time_zone text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_game uuid;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  if not found or v_lobby.status = 'ended' then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_lobby.host_member_id is distinct from p_host_member_id then
    return jsonb_build_object('status', 'not_host');
  end if;
  if v_lobby.status <> 'open' then
    return jsonb_build_object('status', 'already_started');
  end if;

  insert into public.games (lobby_id, category, event_date, radius_mi, age, indoor_outdoor,
                            rounds_total, current_round, stage, center_lat, center_lng, time_zone)
  values (p_lobby_id, p_category, case when p_category = 'events' then p_event_date end,
          p_radius_mi, p_age, p_indoor_outdoor, p_rounds, 1, 'picks', p_lat, p_lng, p_time_zone)
  returning id into v_game;

  update public.lobbies set status = 'locked', current_game_id = v_game where id = p_lobby_id;
  return jsonb_build_object('status', 'ok', 'game_id', v_game);
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-only, like every other function
-- ---------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array[
    'reserve_api_units(text, integer, integer)',
    'claim_search(uuid, integer)',
    'search_progress(uuid, jsonb)',
    'save_options(uuid, jsonb)',
    'finish_search(uuid, text, jsonb, jsonb)',
    'change_criteria(uuid, uuid, text, date, numeric, text, text, smallint, double precision, double precision, text)',
    'end_game(uuid, uuid)',
    'start_game(uuid, uuid, text, date, numeric, text, text, smallint, double precision, double precision, text)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
