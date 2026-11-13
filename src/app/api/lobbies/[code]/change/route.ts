import { isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { newLobbyCode } from "@/lib/server/codes";
import { findActiveMember } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

// "Change lobby" (screen 16): the host moves everyone still here to a new
// lobby code for another game. The old code stops working and the finished
// game is deleted; the other phones follow on the old lobby's ping.
export const POST = route(async ({ request, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const found = await findActiveMember(params.code, device.hash);
  if (!found) return fail(404, "not_found", "This lobby has ended.");

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db().rpc("change_lobby", {
      p_lobby_id: found.lobby.id,
      p_host_member_id: found.me.id,
      p_code: newLobbyCode(),
    });
    if (error) throw error;
    if (data.status === "code_taken") continue;
    if (data.status === "not_host") return fail(403, "not_host", "Only the host can change the lobby.");
    if (data.status === "wrong_stage") return fail(409, "wrong_stage", "The game isn't over yet.");
    if (data.status !== "ok") return fail(404, "not_found", "This lobby has ended.");
    return ok({ code: data.code as string });
  }
  throw new Error("Could not find a free lobby code");
});
