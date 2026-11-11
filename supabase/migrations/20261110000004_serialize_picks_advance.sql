-- Serialize leave/remove with submit/unready before counting ready picks.
-- Otherwise advance_after_picks can use a stale ready count while waiting
-- for a concurrent unready transaction to release the game row.

create or replace function public.advance_after_picks(p_game_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_missing integer;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.stage <> 'picks' then
    return coalesce(v_game.stage, 'missing');
  end if;
  select count(*) into v_missing
  from public.members m
  where m.lobby_id = v_game.lobby_id and m.removed_at is null and m.left_at is null
    and not exists (select 1 from public.picks p
                    where p.game_id = p_game_id and p.member_id = m.id and p.ready);
  if v_missing = 0 then
    update public.games set stage = 'searching' where id = p_game_id;
    return 'searching';
  end if;
  return 'picks';
end;
$$;

-- CREATE OR REPLACE preserves the existing service_role-only grants.
