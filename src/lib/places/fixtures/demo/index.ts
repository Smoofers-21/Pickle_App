// Saved sample searches for demo mode, per demo area (src/lib/game/demo-areas.ts).
// Recorded with scripts/record-demo-samples.mjs; public place and event data only.

import type { DemoArea } from "@/lib/game/demo-areas";
import fayettevilleBars from "./fayetteville-bars.json";
import fayettevilleFood from "./fayetteville-food.json";
import losAngelesBars from "./los-angeles-bars.json";
import losAngelesFood from "./los-angeles-food.json";
// Events for each area are recorded separately (Ticketmaster); until then
// both areas use the older general sample.
import sampleEvents from "../ticketmaster-sample.json";

export const DEMO_SAMPLES: Record<DemoArea["key"], { food: unknown; bars: unknown; events: unknown }> = {
  fayetteville: { food: fayettevilleFood, bars: fayettevilleBars, events: sampleEvents },
  los_angeles: { food: losAngelesFood, bars: losAngelesBars, events: sampleEvents },
};
