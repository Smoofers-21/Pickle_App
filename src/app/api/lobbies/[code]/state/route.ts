import { after } from "next/server";
import { isValidCode } from "@/lib/lobby-rules";
import { ok, route, tooMany } from "@/lib/server/api";
import { lobbyState } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { runSearchIfNeeded } from "@/lib/server/search";

// Room for a search with widening (two provider calls of up to 8 s each).
export const maxDuration = 30;

// The lobby as this phone should see it. Phones call this when they open the
// lobby, when a "changed" ping arrives, and every 30 seconds as a heartbeat.
// While the game is searching, it also makes sure the search is running: the
// database lets only one server claim it, so extra calls cost nothing.
export const POST = route(async ({ request, device, params }) => {
  if (!isValidCode(params.code)) return ok({ status: "not_found" }, device);
  if (!(await allow(request, device.hash, LIMITS.state))) return tooMany();
  const state = await lobbyState(params.code, device.hash);
  if (state.status === "ok" && state.game?.stage === "searching") {
    const search = state.game.search;
    if (!search || search.status === "running") {
      const gameId = state.game.id;
      after(() => runSearchIfNeeded(gameId));
    }
  }
  return ok(state, device);
});
