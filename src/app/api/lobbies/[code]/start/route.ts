import { EVENT_DAYS_AHEAD, RADIUS_OPTIONS, ROUND_OPTIONS } from "@/lib/game/setup";
import { isCategory } from "@/lib/game/tags";
import { isValidCode } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { findActiveMember } from "@/lib/server/lobby";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

const DAY_MS = 86_400_000;

/** A YYYY-MM-DD date from yesterday (time zones) to two weeks ahead. */
function validEventDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  const today = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return t >= today - DAY_MS && t <= today + EVENT_DAYS_AHEAD * DAY_MS;
}

const isNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

// The host starts the game (screen 07). This locks the lobby.
export const POST = route(async ({ request, body, device, params }) => {
  if (!(await allow(request, device.hash, LIMITS.change))) return tooMany();
  if (!isValidCode(params.code)) return fail(404, "not_found", "This lobby has ended.");

  const { category, eventDate, radiusMi, age, indoorOutdoor, rounds, lat, lng } = body;
  if (!isCategory(category)) return fail(400, "bad_setup", "Pick Food, Bars or Events.");
  if (category === "events" && !validEventDate(eventDate)) return fail(400, "bad_setup", "Pick a date in the next two weeks.");
  if (!RADIUS_OPTIONS.includes(radiusMi as (typeof RADIUS_OPTIONS)[number])) return fail(400, "bad_setup", "Pick a radius.");
  if (age !== "all" && age !== "21_plus") return fail(400, "bad_setup", "Pick an age setting.");
  if (indoorOutdoor !== "either" && indoorOutdoor !== "indoor" && indoorOutdoor !== "outdoor") {
    return fail(400, "bad_setup", "Pick indoor, outdoor or either.");
  }
  if (!ROUND_OPTIONS.includes(rounds as (typeof ROUND_OPTIONS)[number])) return fail(400, "bad_setup", "Pick 1, 2 or 3 rounds.");
  if (!isNumberIn(lat, -90, 90) || !isNumberIn(lng, -180, 180)) {
    return fail(400, "no_location", "Pickle needs your location to search near you.");
  }

  const found = await findActiveMember(params.code, device.hash);
  if (!found) return fail(404, "not_found", "This lobby has ended.");

  const { data, error } = await db().rpc("start_game", {
    p_lobby_id: found.lobby.id,
    p_host_member_id: found.me.id,
    p_category: category,
    p_event_date: category === "events" ? eventDate : null,
    p_radius_mi: radiusMi,
    p_age: age,
    p_indoor_outdoor: indoorOutdoor,
    p_rounds: rounds,
    // Rounded to about 100 m: enough to search nearby, less precise to store.
    p_lat: Math.round(lat * 1000) / 1000,
    p_lng: Math.round(lng * 1000) / 1000,
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
