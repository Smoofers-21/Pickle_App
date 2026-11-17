-- Pickle: Leave after Change lobby (Codex's PR 20 review, Nov 13, 2026)
--
-- If the host changes the lobby at about the same moment a member taps
-- Leave, the leave could land on the old lobby (already ended) and report
-- success while the member's copy in the new lobby stayed active, blocking
-- the next game as a ghost. leave_lobby now answers "moved" for a lobby the
-- group has moved out of; the server then follows the move and leaves the
-- new lobby instead. Otherwise unchanged from the voting migration.

create or replace function public.leave_lobby(p_lobby_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  if found and v_lobby.status = 'ended' and v_lobby.next_lobby_id is not null then
    return jsonb_build_object('status', 'moved');
  end if;
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

revoke all on function public.leave_lobby(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_lobby(uuid, uuid) to service_role;
