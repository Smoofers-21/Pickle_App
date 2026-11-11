import { isValidCode, MAX_MEMBERS } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { DEMO_NAMES } from "@/lib/server/demo";
import { findActiveMember } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

// The host adds 3 demo friends (screen 05). The lobby becomes a demo lobby.
export const POST = route(async ({ request, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const found = await findActiveMember(params.code, device.hash);
  if (!found) return fail(404, "not_found", "This lobby has ended.");

  const { data, error } = await db().rpc("add_demo_friends", {
    p_lobby_id: found.lobby.id,
    p_host_member_id: found.me.id,
    p_names: DEMO_NAMES,
    p_max_members: MAX_MEMBERS,
  });
  if (error) throw error;

  switch (data.status) {
    case "ok":
      return ok({ status: "ok" });
    case "full":
      return fail(409, "full", `There's no room for 3 more (the limit is ${MAX_MEMBERS}).`);
    case "locked":
      return fail(409, "locked", "The game has already started.");
    default:
      return fail(403, "not_host", "Only the host can add demo friends.");
  }
});
