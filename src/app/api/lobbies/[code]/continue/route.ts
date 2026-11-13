import { after } from "next/server";
import { isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { findActiveMember } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { runSearchIfNeeded } from "@/lib/server/search";
import { db } from "@/lib/server/supabase";

export const maxDuration = 30;

// The host moves on from "Round complete" (screen 14): the next round's
// search, or the final vote after the last round.
export const POST = route(async ({ request, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const found = await findActiveMember(params.code, device.hash);
  if (!found) return fail(404, "not_found", "This lobby has ended.");

  const { data, error } = await db().rpc("continue_after_round", {
    p_lobby_id: found.lobby.id,
    p_host_member_id: found.me.id,
  });
  if (error) throw error;
  if (data.status === "not_host") return fail(403, "not_host", "Only the host can continue.");
  if (data.status === "wrong_stage") return fail(409, "wrong_stage", "The game has already moved on.");
  if (data.status !== "ok") return fail(404, "not_found", "There's no game to continue.");
  const gameId = found.lobby.current_game_id;
  if (data.stage === "searching" && gameId) after(() => runSearchIfNeeded(gameId));
  return ok({ status: "ok", stage: data.stage });
});
