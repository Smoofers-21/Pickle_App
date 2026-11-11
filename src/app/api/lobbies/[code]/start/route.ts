import { isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { findActiveMember } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { readSetup } from "@/lib/server/setup";
import { db } from "@/lib/server/supabase";

// The host starts the game (screen 07). This locks the lobby.
export const POST = route(async ({ request, body, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const setup = readSetup(body);
  if (!setup.ok) return fail(400, setup.error, setup.message);

  const found = await findActiveMember(params.code, device.hash);
  if (!found) return fail(404, "not_found", "This lobby has ended.");

  const { data, error } = await db().rpc("start_game", {
    p_lobby_id: found.lobby.id,
    p_host_member_id: found.me.id,
    ...setup.params,
  });
  if (error) throw error;

  switch (data.status) {
    case "ok":
      return ok({ status: "ok" });
    case "not_host":
      return fail(403, "not_host", "Only the host can start the game.");
    case "already_started":
      return fail(409, "already_started", "The game has already started.");
    default:
      return fail(404, "not_found", "This lobby has ended.");
  }
});
