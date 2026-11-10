-- Pickle: game setup, Yes/No picks and demo friends (milestone 3)
--
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Needs 20261108000001_initial_schema.sql to have been run first.

-- ---------------------------------------------------------------------------
-- Table changes
-- ---------------------------------------------------------------------------

alter table public.lobbies
  add column current_game_id uuid references public.games (id) on delete set null;

-- Picks: a tag key, or 'other' plus the typed text, for both No and Yes.
alter table public.picks rename column other_text to no_other;
alter table public.picks drop constraint if exists picks_other_text_check;
alter table public.picks
  add column yes_other text,
  add constraint picks_no_other_check check (
    (no_tag = 'other') = (no_other is not null) and char_length(no_other) <= 30),
  add constraint picks_yes_other_check check (
    (coalesce(yes_tag, '') = 'other') = (yes_other is not null) and char_length(yes_other) <= 30),
  add constraint picks_yes_differs_check check (yes_tag is null or yes_tag = 'other' or yes_tag <> no_tag);

-- ---------------------------------------------------------------------------
-- Live update pings for games and picks (content-free, like members)
-- ---------------------------------------------------------------------------

create or replace function public.on_game_row_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_lobby uuid;
begin
  if tg_table_name = 'games' then
    v_lobby := coalesce(new.lobby_id, old.lobby_id);
  else
    select g.lobby_id into v_lobby from public.games g where g.id = coalesce(new.game_id, old.game_id);
  end if;
  if v_lobby is not null then
    perform public.notify_lobby_changed(v_lobby);
  end if;
  return null;
end;
$$;

create trigger games_changed
  after insert or update of stage, current_round on public.games
  for each row execute function public.on_game_row_changed();

create trigger picks_changed
  after insert or update or delete on public.picks
  for each row execute function public.on_game_row_changed();

-- ---------------------------------------------------------------------------
-- Game functions (called only by the server, with the secret key)
-- ---------------------------------------------------------------------------

-- Moves the game on from picks once every active member has picked.
create or replace function public.advance_after_picks(p_game_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_missing integer;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.stage <> 'picks' then
    return coalesce(v_game.stage, 'missing');
  end if;
  select count(*) into v_missing
  from public.members m
  where m.lobby_id = v_game.lobby_id and m.removed_at is null and m.left_at is null
    and not exists (select 1 from public.picks p where p.game_id = p_game_id and p.member_id = m.id);
  if v_missing = 0 then
    update public.games set stage = 'searching' where id = p_game_id;
    return 'searching';
  end if;
  return 'picks';
end;
$$;

-- The host starts a game: saves the criteria and locks the lobby.
create or replace function public.start_game(
  p_lobby_id uuid, p_host_member_id uuid,
  p_category text, p_event_date date, p_radius_mi numeric, p_age text,
  p_indoor_outdoor text, p_rounds smallint, p_lat double precision, p_lng double precision)
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
                            rounds_total, current_round, stage, center_lat, center_lng)
  values (p_lobby_id, p_category, case when p_category = 'events' then p_event_date end,
          p_radius_mi, p_age, p_indoor_outdoor, p_rounds, 1, 'picks', p_lat, p_lng)
  returning id into v_game;

  update public.lobbies set status = 'locked', current_game_id = v_game where id = p_lobby_id;
  return jsonb_build_object('status', 'ok', 'game_id', v_game);
end;
$$;

-- Saves (or changes) a member's picks while the game is in the picks stage.
create or replace function public.submit_picks(
  p_game_id uuid, p_member_id uuid,
  p_no_tag text, p_no_other text, p_yes_tag text, p_yes_other text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_game.stage <> 'picks' then
    return jsonb_build_object('status', 'wrong_stage');
  end if;
  if not exists (select 1 from public.members
                 where id = p_member_id and lobby_id = v_game.lobby_id
                   and removed_at is null and left_at is null) then
    return jsonb_build_object('status', 'not_member');
  end if;

  insert into public.picks (game_id, member_id, no_tag, no_other, yes_tag, yes_other)
  values (p_game_id, p_member_id, p_no_tag, p_no_other, p_yes_tag, p_yes_other)
  on conflict (game_id, member_id) do update
    set no_tag = excluded.no_tag, no_other = excluded.no_other,
        yes_tag = excluded.yes_tag, yes_other = excluded.yes_other,
        submitted_at = now();

  return jsonb_build_object('status', 'ok', 'stage', public.advance_after_picks(p_game_id));
end;
$$;

-- Demo mode: the host adds simulated members, and the lobby becomes a demo lobby.
create or replace function public.add_demo_friends(
  p_lobby_id uuid, p_host_member_id uuid, p_names text[], p_max_members integer default 10)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_active integer;
  v_name text;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  if not found or v_lobby.host_member_id is distinct from p_host_member_id then
    return jsonb_build_object('status', 'not_host');
  end if;
  if v_lobby.status <> 'open' then
    return jsonb_build_object('status', 'locked');
  end if;
  select count(*) into v_active from public.members
  where lobby_id = p_lobby_id and removed_at is null and left_at is null;
  if v_active + coalesce(array_length(p_names, 1), 0) > p_max_members then
    return jsonb_build_object('status', 'full');
  end if;

  foreach v_name in array p_names loop
    insert into public.members (lobby_id, name, is_demo)
    values (p_lobby_id, public.next_free_name(p_lobby_id, v_name), true);
  end loop;
  update public.lobbies set is_demo = true where id = p_lobby_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- Updated lobby functions
-- ---------------------------------------------------------------------------

-- Leaving or being removed during picks can complete the picks.
create or replace function public.leave_lobby(p_lobby_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  update public.members set left_at = now()
    where id = p_member_id and lobby_id = p_lobby_id and left_at is null and removed_at is null;
  if v_lobby.host_member_id = p_member_id then
    perform public.hand_over_host(p_lobby_id);
  end if;
  if v_lobby.current_game_id is not null then
    perform public.advance_after_picks(v_lobby.current_game_id);
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.remove_member(p_lobby_id uuid, p_host_member_id uuid, p_target_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  if v_lobby.host_member_id is distinct from p_host_member_id then
    return jsonb_build_object('status', 'not_host');
  end if;
  if p_target_member_id = p_host_member_id then
    return jsonb_build_object('status', 'cannot_remove_self');
  end if;
  update public.members set removed_at = now()
    where id = p_target_member_id and lobby_id = p_lobby_id and removed_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_lobby.current_game_id is not null then
    perform public.advance_after_picks(v_lobby.current_game_id);
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Same as before, except a demo member can never be taken over by name.
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

  -- 2. Someone already has this name.
  select * into v_member from public.members
  where lobby_id = v_lobby.id and lower(name) = lower(p_name);
  if found and v_member.removed_at is null and not v_member.is_demo
     and (v_member.left_at is not null
          or v_member.last_seen_at < now() - make_interval(secs => p_stale_seconds)) then
    if v_member.left_at is not null and v_lobby.status = 'open' then
      select count(*) into v_active from public.members
      where lobby_id = v_lobby.id and removed_at is null and left_at is null;
      if v_active >= p_max_members then
        return jsonb_build_object('status', 'full');
      end if;
    end if;
    update public.members
      set device_token_hash = p_device_hash, left_at = null, last_seen_at = now()
      where id = v_member.id;
    if v_lobby.host_member_id is null then
      perform public.hand_over_host(v_lobby.id);
    end if;
    return jsonb_build_object('status', 'ok', 'member_id', v_member.id, 'name', v_member.name,
                              'renamed', false, 'rejoined', true);
  end if;

  -- 3. A new member.
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

-- A demo member never becomes host (they can't run the game).
create or replace function public.hand_over_host(p_lobby_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare v_next uuid;
begin
  select m.id into v_next
  from public.members m
  where m.lobby_id = p_lobby_id and m.removed_at is null and m.left_at is null and not m.is_demo
  order by m.joined_at, m.id
  limit 1;

  if v_next is null then
    update public.lobbies set host_member_id = null, status = 'ended' where id = p_lobby_id;
  else
    update public.lobbies set host_member_id = v_next where id = p_lobby_id;
  end if;
  return v_next;
end;
$$;

-- Only the server (service_role, via the secret key) may call these.
do $$
declare f text;
begin
  foreach f in array array[
    'on_game_row_changed()', 'advance_after_picks(uuid)',
    'start_game(uuid, uuid, text, date, numeric, text, text, smallint, double precision, double precision)',
    'submit_picks(uuid, uuid, text, text, text, text)',
    'add_demo_friends(uuid, uuid, text[], integer)',
    'leave_lobby(uuid, uuid)', 'remove_member(uuid, uuid, uuid)',
    'join_lobby(text, text, text, integer, integer)', 'hand_over_host(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
