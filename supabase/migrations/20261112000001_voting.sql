-- Pickle: voting and rounds (milestone 6, screens 13-15).
--
-- Members rank the round's options (or the finalists); the server totals the
-- points (1st = n points ... last = 1), breaks ties by most 1st-place votes,
-- then at random, and moves the game on:
--   1 round:    cards_and_voting -> results
--   2-3 rounds: cards_and_voting -> round_complete -> (host) searching for the
--               next round ... -> round_complete -> (host) final_vote -> results
-- Changing a submitted ranking un-readies the member in the same locked step
-- as everyone else's submit, so a round can't end while someone is changing.
-- Only the server (service_role) may call these functions.

-- A ranking stays saved while its member changes it; only ready ones count.
alter table public.votes add column ready boolean not null default true;

create trigger votes_changed
  after insert or update or delete on public.votes
  for each row execute function public.on_game_row_changed();

-- The voting round for the game's stage: the current round, 0 for the final,
-- null when nobody is voting.
create or replace function public.voting_round(p_game public.games)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_game.stage
    when 'cards_and_voting' then p_game.current_round
    when 'final_vote' then 0::smallint
    else null end;
$$;

-- The option IDs a ranking must contain, exactly once each: the round's
-- shown options, or for the final the options that advanced from each round.
create or replace function public.ballot_options(p_game_id uuid, p_round smallint)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(id order by id), '{}')
  from (
    select o.id from public.options o
    where p_round > 0 and o.game_id = p_game_id and o.shown_in_round = p_round
    union
    select r.option_id from public.round_results r
    where p_round = 0 and r.game_id = p_game_id and r.round_no > 0 and r.advanced
  ) ids;
$$;

-- Totals a finished voting round and moves the game to its next stage.
-- Caller holds the game row lock. Only active members' ready rankings count.
create or replace function public.tally_round(p_game public.games, p_round smallint)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_next text;
begin
  delete from public.round_results where game_id = p_game.id and round_no = p_round;

  insert into public.round_results (game_id, round_no, option_id, points, first_place_votes, place, advanced)
  select p_game.id, p_round, t.option_id, t.points, t.firsts,
         row_number() over (order by t.points desc, t.firsts desc, random()), false
  from (
    select b.option_id,
           coalesce(sum(cardinality(v.ranking) - array_position(v.ranking, b.option_id) + 1), 0)::int as points,
           count(*) filter (where v.ranking[1] = b.option_id)::int as firsts
    from unnest(public.ballot_options(p_game.id, p_round)) as b(option_id)
    left join public.votes v
      on v.game_id = p_game.id and v.round_no = p_round and v.ready
     and array_position(v.ranking, b.option_id) is not null
     and exists (select 1 from public.members m where m.id = v.member_id
                   and m.removed_at is null and m.left_at is null)
    group by b.option_id
  ) t;

  if p_round > 0 and p_game.rounds_total > 1 then
    -- Each round's top 2 go to the final.
    update public.round_results set advanced = place <= 2
      where game_id = p_game.id and round_no = p_round;
    v_next := 'round_complete';
  else
    v_next := 'results';
  end if;

  update public.games set stage = v_next where id = p_game.id;
  return v_next;
end;
$$;

-- Ends the voting round once every active member has a ready ranking.
create or replace function public.advance_after_votes(p_game_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_round smallint;
  v_missing integer;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then return 'missing'; end if;
  v_round := public.voting_round(v_game);
  if v_round is null then return v_game.stage; end if;

  select count(*) into v_missing
  from public.members m
  where m.lobby_id = v_game.lobby_id and m.removed_at is null and m.left_at is null
    and not exists (select 1 from public.votes v
                    where v.game_id = p_game_id and v.round_no = v_round
                      and v.member_id = m.id and v.ready);
  if v_missing > 0 then return v_game.stage; end if;

  -- Nobody active is left to vote: leave the game as it is.
  if not exists (select 1 from public.members m where m.lobby_id = v_game.lobby_id
                   and m.removed_at is null and m.left_at is null) then
    return v_game.stage;
  end if;
  return public.tally_round(v_game, v_round);
end;
$$;

-- Submits (or re-submits) a ranking for the round being voted on.
create or replace function public.submit_vote(
  p_game_id uuid, p_member_id uuid, p_round smallint, p_ranking uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_round smallint;
  v_expected uuid[];
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_round := public.voting_round(v_game);
  if v_round is null or v_round is distinct from p_round then
    return jsonb_build_object('status', 'wrong_stage');
  end if;
  if not exists (select 1 from public.members where id = p_member_id and lobby_id = v_game.lobby_id
                   and removed_at is null and left_at is null) then
    return jsonb_build_object('status', 'not_member');
  end if;

  -- Exactly this round's options, each once.
  v_expected := public.ballot_options(p_game_id, v_round);
  if cardinality(v_expected) = 0 or p_ranking is null
     or cardinality(p_ranking) <> cardinality(v_expected)
     or (select array_agg(x order by x) from unnest(p_ranking) x) is distinct from v_expected then
    return jsonb_build_object('status', 'invalid_ranking');
  end if;

  insert into public.votes (game_id, round_no, member_id, ranking, ready)
  values (p_game_id, v_round, p_member_id, p_ranking, true)
  on conflict (game_id, round_no, member_id) do update
    set ranking = excluded.ranking, ready = true, submitted_at = now();

  return jsonb_build_object('status', 'ok', 'stage', public.advance_after_votes(p_game_id));
end;
$$;

-- "Change my ranking": no longer done until submitted again. Same lock as
-- submit, so it can't race with the last person's vote.
create or replace function public.unready_vote(p_game_id uuid, p_member_id uuid, p_round smallint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if public.voting_round(v_game) is distinct from p_round then
    return jsonb_build_object('status', 'wrong_stage');
  end if;
  update public.votes set ready = false
    where game_id = p_game_id and round_no = p_round and member_id = p_member_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- The host moves on from "Round complete": the next round's search, or the
-- final vote after the last round.
create or replace function public.continue_after_round(p_lobby_id uuid, p_host_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_game public.games%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  if not found or v_lobby.status = 'ended' or v_lobby.current_game_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_lobby.host_member_id is distinct from p_host_member_id then
    return jsonb_build_object('status', 'not_host');
  end if;
  select * into v_game from public.games where id = v_lobby.current_game_id for update;
  if v_game.stage <> 'round_complete' then
    return jsonb_build_object('status', 'wrong_stage');
  end if;

  if v_game.current_round < v_game.rounds_total then
    -- Same criteria, all-new options: the search skips everything already shown.
    update public.games
      set current_round = current_round + 1, stage = 'searching', search = null,
          search_claim_token = null, search_claimed_at = null
      where id = v_game.id;
    return jsonb_build_object('status', 'ok', 'stage', 'searching');
  end if;
  update public.games set stage = 'final_vote' where id = v_game.id;
  return jsonb_build_object('status', 'ok', 'stage', 'final_vote');
end;
$$;

-- Leaving or being removed can complete a round of picks or votes.
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
    perform public.advance_after_votes(v_lobby.current_game_id);
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
    perform public.advance_after_votes(v_lobby.current_game_id);
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'voting_round(public.games)', 'ballot_options(uuid, smallint)',
    'tally_round(public.games, smallint)', 'advance_after_votes(uuid)',
    'submit_vote(uuid, uuid, smallint, uuid[])', 'unready_vote(uuid, uuid, smallint)',
    'continue_after_round(uuid, uuid)',
    'leave_lobby(uuid, uuid)', 'remove_member(uuid, uuid, uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
