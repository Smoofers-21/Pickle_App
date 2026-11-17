import { isValidCode } from "@/lib/lobby-rules";
import { ok, route, tooMany } from "@/lib/server/api";
import { findLobby, findMe } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

// Leave a lobby. If the host leaves, the earliest-joined member becomes host.
// If the group just moved to a new lobby (Change lobby), the leave follows
// this phone there, so it can't stay behind as a ghost in the new lobby.
export const POST = route(async ({ request, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return ok({ status: "ok" });

  let code = params.code;
  for (let hop = 0; hop < 4; hop++) {
    const lobby = await findLobby(code);
    const me = lobby && (await findMe(lobby.id, device.hash));
    if (lobby && me && !me.left_at && !me.removed_at) {
      const { data, error } = await db().rpc("leave_lobby", { p_lobby_id: lobby.id, p_member_id: me.id });
      if (error) throw error;
      if (data?.status !== "moved") return ok({ status: "ok" });
    }
    // Not active here, or the group moved while we were leaving: follow the
    // move if this phone went with it; otherwise there's nothing to leave.
    const { data: movedTo, error } = await db().rpc("moved_lobby_code", { p_code: code, p_device_hash: device.hash });
    if (error) throw error;
    if (typeof movedTo !== "string") return ok({ status: "ok" });
    code = movedTo;
  }
  throw new Error("Could not leave: the lobby kept moving");
});
