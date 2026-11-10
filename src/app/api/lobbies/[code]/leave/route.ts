import { isValidCode } from "@/lib/lobby-rules";
import { ok, route, tooMany } from "@/lib/server/api";
import { findLobby, findMe } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

// Leave a lobby. If the host leaves, the earliest-joined member becomes host.
export const POST = route(async ({ request, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return ok({ status: "ok" });

  const lobby = await findLobby(params.code);
  const me = lobby && (await findMe(lobby.id, device.hash));
  if (lobby && me && !me.left_at && !me.removed_at) {
    const { error } = await db().rpc("leave_lobby", { p_lobby_id: lobby.id, p_member_id: me.id });
    if (error) throw error;
  }
  return ok({ status: "ok" });
});
