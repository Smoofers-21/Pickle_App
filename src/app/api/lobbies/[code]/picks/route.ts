import { after } from "next/server";
import { cleanOther, findTag, type Category } from "@/lib/game/tags";
import { isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { findActiveMember, findGame } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { runSearchIfNeeded } from "@/lib/server/search";
import { db } from "@/lib/server/supabase";

export const maxDuration = 30;

type Side = { tag: string; other: string | null };

/** Checks one side of a pick: a tag from this category's list, or "other" with text. */
function readSide(raw: unknown, category: Category): Side | null {
  if (!raw || typeof raw !== "object") return null;
  const { tag, other } = raw as { tag?: unknown; other?: unknown };
  if (tag === "other") {
    const text = cleanOther(other);
    return text ? { tag: "other", other: text } : null;
  }
  return typeof tag === "string" && findTag(category, tag) ? { tag, other: null } : null;
}

// Submit or change your Yes / No picks (screen 08).
export const POST = route(async ({ request, body, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const found = await findActiveMember(params.code, device.hash);
  if (!found || !found.lobby.current_game_id) return fail(404, "not_found", "There's no game to pick for.");
  const game = await findGame(found.lobby.current_game_id);
  if (!game) return fail(404, "not_found", "There's no game to pick for.");

  const no = readSide(body.no, game.category);
  if (!no) return fail(400, "bad_picks", "Pick one No preference.");
  const yes = body.yes == null ? null : readSide(body.yes, game.category);
  if (body.yes != null && !yes) return fail(400, "bad_picks", "That Yes isn't one of the options.");
  if (yes && yes.tag !== "other" && yes.tag === no.tag) {
    return fail(400, "bad_picks", "Your Yes and No can't be the same.");
  }

  const { data, error } = await db().rpc("submit_picks", {
    p_game_id: game.id,
    p_member_id: found.me.id,
    p_no_tag: no.tag,
    p_no_other: no.other,
    p_yes_tag: yes?.tag ?? null,
    p_yes_other: yes?.other ?? null,
  });
  if (error) throw error;
  if (data.status === "wrong_stage") return fail(409, "wrong_stage", "Picks are closed: the search has started.");
  if (data.status !== "ok") return fail(404, "not_found", "There's no game to pick for.");
  // The last pick starts the search right away (phones also check on their next refresh).
  if (data.stage === "searching") after(() => runSearchIfNeeded(game.id));
  return ok({ status: "ok", stage: data.stage });
});

// "Change my picks": you stop counting as done until you submit again, so
// the search can't start while you're still changing them.
export const DELETE = route(async ({ request, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const found = await findActiveMember(params.code, device.hash);
  if (!found || !found.lobby.current_game_id) return fail(404, "not_found", "There's no game to pick for.");

  const { data, error } = await db().rpc("unready_picks", {
    p_game_id: found.lobby.current_game_id,
    p_member_id: found.me.id,
  });
  if (error) throw error;
  if (data.status === "wrong_stage") {
    return fail(409, "wrong_stage", "Too late: everyone was in, so the search has started.");
  }
  if (data.status !== "ok") return fail(404, "not_found", "There's no game to pick for.");
  return ok({ status: "ok" });
});
