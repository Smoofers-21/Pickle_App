import "server-only";
import type { Category } from "@/lib/game/tags";
import food from "@/lib/places/fixtures/geoapify-food-sample.json";
import bars from "@/lib/places/fixtures/geoapify-bars-sample.json";
import events from "@/lib/places/fixtures/ticketmaster-sample.json";
import { parseGeoapify } from "@/lib/places/geoapify-parse";
import { parseTicketmaster } from "@/lib/places/ticketmaster-parse";
import type { PlacesPage } from "@/lib/places/provider";

/** Stable saved samples for the documented demo mode; never consumes API quota. */
export function demoSearch(category: Category, eventDate: string | null): PlacesPage {
  const candidates = category === "events"
    ? parseTicketmaster(events).candidates.map((c) => ({ ...c, eventDate }))
    : parseGeoapify(category === "bars" ? bars : food, category, { lat: 30.2672, lng: -97.7431 }, {
      now: new Date("2026-11-12T01:00:00Z"), timeZone: "America/Chicago",
    });
  return { candidates, more: false, consumed: candidates.length };
}
