import { cleanName, isValidCode, MAX_MEMBERS } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { allow, isBlocked, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

// Join (or rejoin) a lobby with a name (screen 03).
export const POST = route(async ({ request, body, device, params }) => {
  if (await isBlocked(request, device.hash, LIMITS.wrongCode)) return tooMany();
  if (!(await allow(request, device.hash, LIMITS.join))) return tooMany();

  const name = cleanName(body.name);
  if (!name) return fail(400, "bad_name", "Use 1–20 letters or numbers for your name.");
  if (!isValidCode(params.code)) return fail(404, "not_found", "This code doesn't exist or has expired.");

  const { data, error } = await db().rpc("join_lobby", {
    p_code: params.code,
    p_name: name,
    p_device_hash: device.hash,
    p_max_members: MAX_MEMBERS,
  });
  if (error) throw error;

  switch (data.status) {
    case "ok":
      return ok({ memberId: data.member_id, name: data.name, renamed: data.renamed, rejoined: data.rejoined }, device);
    case "not_found":
      await allow(request, device.hash, LIMITS.wrongCode);
      return fail(404, "not_found", "This code doesn't exist or has expired. Check it with the host.");
    case "full":
      return fail(409, "full", `This lobby already has ${MAX_MEMBERS} members.`);
    case "locked":
      return fail(409, "locked", "This lobby is locked until the game ends. Ask the host for the next code.");
    case "removed":
      return fail(403, "removed", "The host removed you from this lobby.");
    default:
      throw new Error(`Unexpected join result ${String(data.status)}`);
  }
});
