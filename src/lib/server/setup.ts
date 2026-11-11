import "server-only";
import { EVENT_DAYS_AHEAD, isCalendarDate, RADIUS_OPTIONS, ROUND_OPTIONS } from "@/lib/game/setup";
import { isCategory, type Category } from "@/lib/game/tags";
import { isValidTimeZone } from "@/lib/places/opening-hours";

// Checks the host's setup (screen 07), for starting a game and for changing
// the criteria after "nothing found".

const DAY_MS = 86_400_000;

/** A YYYY-MM-DD date from yesterday (time zones) to two weeks ahead. */
function validEventDate(value: unknown): value is string {
  if (!isCalendarDate(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  const today = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return t >= today - DAY_MS && t <= today + EVENT_DAYS_AHEAD * DAY_MS;
}

const isNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export type SetupParams = {
  p_category: Category;
  p_event_date: string | null;
  p_radius_mi: number;
  p_age: "all" | "21_plus";
  p_indoor_outdoor: "either" | "indoor" | "outdoor";
  p_rounds: number;
  p_lat: number;
  p_lng: number;
  p_time_zone: string | null;
};

export function readSetup(
  body: Record<string, unknown>,
): { ok: true; params: SetupParams } | { ok: false; error: string; message: string } {
  const { category, eventDate, radiusMi, age, indoorOutdoor, rounds, lat, lng, timeZone } = body;
  const bad = (message: string) => ({ ok: false as const, error: "bad_setup", message });
  if (!isCategory(category)) return bad("Pick Food, Bars or Events.");
  if (category === "events" && !validEventDate(eventDate)) return bad("Pick a date in the next two weeks.");
  if (!RADIUS_OPTIONS.includes(radiusMi as (typeof RADIUS_OPTIONS)[number])) return bad("Pick a radius.");
  if (age !== "all" && age !== "21_plus") return bad("Pick an age setting.");
  if (indoorOutdoor !== "either" && indoorOutdoor !== "indoor" && indoorOutdoor !== "outdoor") {
    return bad("Pick indoor, outdoor or either.");
  }
  if (!ROUND_OPTIONS.includes(rounds as (typeof ROUND_OPTIONS)[number])) return bad("Pick 1, 2 or 3 rounds.");
  if (!isNumberIn(lat, -90, 90) || !isNumberIn(lng, -180, 180)) {
    return { ok: false, error: "no_location", message: "Pickle needs your location to search near you." };
  }
  return {
    ok: true,
    params: {
      p_category: category,
      p_event_date: category === "events" ? (eventDate as string) : null,
      p_radius_mi: radiusMi as number,
      p_age: age,
      p_indoor_outdoor: indoorOutdoor,
      p_rounds: rounds as number,
      // Rounded to about 100 m: enough to search nearby, less precise to store.
      p_lat: Math.round(lat * 1000) / 1000,
      p_lng: Math.round(lng * 1000) / 1000,
      // The phone's time zone, for "open now". Optional; unknown zones are dropped.
      p_time_zone: isValidTimeZone(timeZone) ? timeZone : null,
    },
  };
}
