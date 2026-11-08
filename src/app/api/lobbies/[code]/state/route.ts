import { isValidCode } from "@/lib/lobby-rules";
import { ok, route, tooMany } from "@/lib/server/api";
import { lobbyState } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";

// The lobby as this phone should see it. Phones call this when they open the
// lobby, when a "changed" ping arrives, and every 30 seconds as a heartbeat.
export const POST = route(async ({ request, device, params }) => {
  if (!isValidCode(params.code)) return ok({ status: "not_found" }, device);
  if (!(await allow(request, device.hash, LIMITS.state))) return tooMany();
  return ok(await lobbyState(params.code, device.hash), device);
});
