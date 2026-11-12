-- Pickle: tied options share their place in the deciding vote (PR 19
-- review, Codex).
--
-- The results order is by points, then 1st-place votes; options still tied
-- share the place (1st, 1st, 3rd). Random tie-breaks stay only where a
-- strict order is needed: choosing each round's top 2 for the final.
-- Same signature; only the server may call it.

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

  -- A round that feeds the final needs a strict order to pick its top 2, so
  -- remaining ties are broken at random. The deciding vote (results) keeps
  -- ties as shared places instead: 1st, 1st, 3rd (product spec, Results).
  insert into public.round_results (game_id, round_no, option_id, points, first_place_votes, place, advanced)
  select p_game.id, p_round, t.option_id, t.points, t.firsts,
         case when p_round > 0 and p_game.rounds_total > 1
           then row_number() over (order by t.points desc, t.firsts desc, random())
           else rank() over (order by t.points desc, t.firsts desc) end,
         false
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

revoke all on function public.tally_round(public.games, smallint) from public, anon, authenticated;
grant execute on function public.tally_round(public.games, smallint) to service_role;
