-- Pickle: "Change my picks" takes you out of "done" (milestone 3)
--
-- Before: changing picks only reopened the picks screen on the phone; on the
-- server the old picks still counted, so the search could start while
-- someone was still changing theirs. Now a member who taps "Change my picks"
-- is no longer counted as done until they submit again. Their previous picks
-- are kept, so the screen opens pre-filled.

alter table public.picks add column ready boolean not null default true;

-- Counts only picks that are ready.
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
    and not exists (select 1 from public.picks p
                    where p.game_id = p_game_id and p.member_id = m.id and p.ready);
  if v_missing = 0 then
    update public.games set stage = 'searching' where id = p_game_id;
    return 'searching';
  end if;
  return 'picks';
end;
$$;

-- Submitting (or re-submitting) marks the picks ready.
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

  insert into public.picks (game_id, member_id, no_tag, no_other, yes_tag, yes_other, ready)
  values (p_game_id, p_member_id, p_no_tag, p_no_other, p_yes_tag, p_yes_other, true)
  on conflict (game_id, member_id) do update
    set no_tag = excluded.no_tag, no_other = excluded.no_other,
        yes_tag = excluded.yes_tag, yes_other = excluded.yes_other,
        ready = true, submitted_at = now();

  return jsonb_build_object('status', 'ok', 'stage', public.advance_after_picks(p_game_id));
end;
$$;

-- "Change my picks": no longer done, until submitted again. Locks the game
-- row, so it can't race with the last person's submit: whichever comes
-- first wins, and if the search already started this returns wrong_stage.
create or replace function public.unready_picks(p_game_id uuid, p_member_id uuid)
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
  update public.picks set ready = false where game_id = p_game_id and member_id = p_member_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'advance_after_picks(uuid)', 'submit_picks(uuid, uuid, text, text, text, text)',
    'unready_picks(uuid, uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
