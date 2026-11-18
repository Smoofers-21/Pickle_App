import "server-only";
import { nearestDemoArea } from "@/lib/game/demo-areas";
import type { Category } from "@/lib/game/tags";
import { DEMO_SAMPLES } from "@/lib/places/fixtures/demo";
import { parseGeoapify } from "@/lib/places/geoapify-parse";
import type { PlacesPage, SearchArea } from "@/lib/places/provider";
import { parseTicketmaster } from "@/lib/places/ticketmaster-parse";

/**
 * Demo mode's search: the saved sample for the demo area the host picked
 * (the game's center is that area's center), so demo games show real local
 * places without calling the APIs or spending credits. Demo games replay a
 * Friday evening in the area for "open now" (see DemoArea.replayAt), and
 * saved events are shown on the date the host picked: a sample, not a
 * live schedule.
 */
export function demoSearch(category: Category, eventDate: string | null, center: Pick<SearchArea, "lat" | "lng">, now?: Date): PlacesPage {
  const area = nearestDemoArea(center.lat, center.lng);
  const sample = DEMO_SAMPLES[area.key];
  const candidates =
    category === "events"
      ? parseTicketmaster(sample.events).candidates.map((c) => ({ ...c, eventDate }))
      : parseGeoapify(category === "bars" ? sample.bars : sample.food, category, { lat: area.lat, lng: area.lng }, {
          now: now ?? new Date(area.replayAt),
          timeZone: area.timeZone,
        });
  return { candidates, more: false, consumed: candidates.length };
}
