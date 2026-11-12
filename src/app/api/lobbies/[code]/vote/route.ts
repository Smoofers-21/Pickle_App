import { isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { findActiveMember } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The round being voted on (0 = final), or null when it isn't a small whole number. */
function readRound(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 3 ? raw : null;
}

/** A ranking: 1 to 6 distinct option IDs. The database checks they are exactly this round's. */
function readRanking(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 6) return null;
  if (!raw.every((id) => typeof id === "string" && UUID.test(id))) return null;
  const ids = raw.map((id: string) => id.toLowerCase());
  return new Set(ids).size === ids.length ? ids : null;
}

// Submit or change your ranking for this round or the final (screens 13 and 15).
export const POST = route(async ({ request, body, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const round = readRound(body.round);
  const ranking = readRanking(body.ranking);
  if (round === null || !ranking) return fail(400, "bad_ranking", "Rank every option before submitting.");

  const found = await findActiveMember(params.code, device.hash);
  if (!found || !found.lobby.current_game_id) return fail(404, "not_found", "There's no game to vote in.");

  const { data, error } = await db().rpc("submit_vote", {
    p_game_id: found.lobby.current_game_id,
    p_member_id: found.me.id,
    p_round: round,
    p_ranking: ranking,
  });
  if (error) throw error;
  if (data.status === "wrong_stage") return fail(409, "wrong_stage", "This vote has closed. Your screen will update.");
  if (data.status === "invalid_ranking") return fail(400, "bad_ranking", "The options changed. Reload and rank them again.");
  if (data.status !== "ok") return fail(404, "not_found", "There's no game to vote in.");
  return ok({ status: "ok", stage: data.stage });
});

// "Change my ranking": you stop counting as done until you submit again, so
// the round can't end while you're still changing it.
export const DELETE = route(async ({ request, body, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");
  const round = readRound(body.round);
  if (round === null) return fail(400, "bad_round", "That vote isn't open.");

  const found = await findActiveMember(params.code, device.hash);
  if (!found || !found.lobby.current_game_id) return fail(404, "not_found", "There's no game to vote in.");

  const { data, error } = await db().rpc("unready_vote", {
    p_game_id: found.lobby.current_game_id,
    p_member_id: found.me.id,
    p_round: round,
  });
  if (error) throw error;
  if (data.status === "wrong_stage") return fail(409, "wrong_stage", "Too late: everyone had voted, so the round is over.");
  if (data.status !== "ok") return fail(404, "not_found", "There's no game to vote in.");
  return ok({ status: "ok" });
});
