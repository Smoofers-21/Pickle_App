import { isUuid, isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { findLobby, findMe } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

// The host removes a member (screen 05).
export const POST = route(async ({ request, body, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code) || !isUuid(body.memberId)) return fail(400, "bad_request", "That member can't be removed.");

  const lobby = await findLobby(params.code);
  const me = lobby && (await findMe(lobby.id, device.hash));
  if (!lobby || !me || me.left_at || me.removed_at) return fail(404, "not_found", "This lobby has ended.");

  const { data, error } = await db().rpc("remove_member", {
    p_lobby_id: lobby.id,
    p_host_member_id: me.id,
    p_target_member_id: body.memberId,
  });
  if (error) throw error;

  switch (data.status) {
    case "ok":
      return ok({ status: "ok" });
    case "not_host":
      return fail(403, "not_host", "Only the host can remove people.");
    case "cannot_remove_self":
      return fail(400, "cannot_remove_self", "To leave, use Leave instead.");
    default:
      return fail(404, "not_found", "That member already left.");
  }
});
