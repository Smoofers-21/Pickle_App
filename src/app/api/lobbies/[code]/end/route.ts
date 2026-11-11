import { isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { findActiveMember } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

// "End game" (screen 11): deletes the game and its data, and reopens the lobby.
export const POST = route(async ({ request, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const found = await findActiveMember(params.code, device.hash);
  if (!found) return fail(404, "not_found", "This lobby has ended.");

  const { data, error } = await db().rpc("end_game", { p_lobby_id: found.lobby.id, p_host_member_id: found.me.id });
  if (error) throw error;
  if (data.status === "not_host") return fail(403, "not_host", "Only the host can end the game.");
  if (data.status !== "ok" && data.status !== "no_game") return fail(404, "not_found", "This lobby has ended.");
  return ok({ status: "ok" });
});
