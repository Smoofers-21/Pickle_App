import { isValidCode, MAX_MEMBERS } from "@/lib/lobby-rules";
import type { CodeCheck } from "@/lib/lobby-types";
import { ok, route, tooMany } from "@/lib/server/api";
import { allow, isBlocked, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

// Check a lobby code before asking for a name (screen 02).
export const POST = route(async ({ request, device, params }) => {
  if (await isBlocked(request, device.hash, LIMITS.wrongCode)) return tooMany();
  if (!(await allow(request, device.hash, LIMITS.lookup))) return tooMany();

  const code = params.code;
  let result: CodeCheck = "not_found";
  if (isValidCode(code)) {
    const { data, error } = await db().rpc("check_lobby_code", {
      p_code: code,
      p_device_hash: device.hash,
      p_max_members: MAX_MEMBERS,
    });
    if (error) throw error;
    result = data as CodeCheck;
  }

  if (result === "not_found") {
    // Count wrong codes, to stop people guessing them.
    if (!(await allow(request, device.hash, LIMITS.wrongCode))) return tooMany();
  }
  return ok({ result }, device);
});
