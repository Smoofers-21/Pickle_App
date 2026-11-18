// Saved sample searches for demo mode, per demo area (src/lib/game/demo-areas.ts).
// Public place and event data only. Food and bars are recorded with
// scripts/record-demo-samples.mjs; events with the "Record demo events"
// GitHub Action (.github/workflows/record-demo-events.yml), which runs the
// same script with the Ticketmaster key kept in GitHub's secrets and offers
// the result as a pull request.

import type { DemoArea } from "@/lib/game/demo-areas";
import fayettevilleBars from "./fayetteville-bars.json";
import fayettevilleEvents from "./fayetteville-events.json";
import fayettevilleFood from "./fayetteville-food.json";
import losAngelesBars from "./los-angeles-bars.json";
import losAngelesEvents from "./los-angeles-events.json";
import losAngelesFood from "./los-angeles-food.json";

export const DEMO_SAMPLES: Record<DemoArea["key"], { food: unknown; bars: unknown; events: unknown }> = {
  fayetteville: { food: fayettevilleFood, bars: fayettevilleBars, events: fayettevilleEvents },
  los_angeles: { food: losAngelesFood, bars: losAngelesBars, events: losAngelesEvents },
};
