import { after } from "next/server";
import { isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { findActiveMember } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { runSearchIfNeeded } from "@/lib/server/search";
import { readSetup } from "@/lib/server/setup";
import { db } from "@/lib/server/supabase";

export const maxDuration = 30;

// "Change criteria" after nothing was found (screen 11 → 07). Same category:
// the search runs again with everyone's picks. New category: everyone picks again.
export const POST = route(async ({ request, body, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.search))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const setup = readSetup(body);
  if (!setup.ok) return fail(400, setup.error, setup.message);

  const found = await findActiveMember(params.code, device.hash);
  if (!found || !found.lobby.current_game_id) return fail(404, "not_found", "There's no game to change.");
  const gameId = found.lobby.current_game_id;

  const { data, error } = await db().rpc("change_criteria", {
    p_game_id: gameId,
    p_host_member_id: found.me.id,
    ...setup.params,
  });
  if (error) throw error;

  switch (data.status) {
    case "ok":
      after(() => runSearchIfNeeded(gameId));
      return ok({ status: "ok" });
    case "not_host":
      return fail(403, "not_host", "Only the host can change the criteria.");
    case "wrong_stage":
      return fail(409, "wrong_stage", "The search is already running.");
    default:
      return fail(404, "not_found", "There's no game to change.");
  }
});
