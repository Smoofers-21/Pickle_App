// Records the saved sample searches for demo mode (milestone 8): food, bars
// and events around each demo area in src/lib/game/demo-areas.ts. Demo
// games then show these real local places and events without calling the
// APIs or spending credits. Run again shortly before a demo so the events
// are current.
//
//   GEOAPIFY_API_KEY=... TICKETMASTER_API_KEY=... node scripts/record-demo-samples.mjs [--places] [--events]
//
// With neither flag it records both. Keys come only from the environment
// and are never written to the samples or printed. Costs per run: 5
// Geoapify credits per area and category, 1 Ticketmaster call per area.

import { mkdirSync, writeFileSync } from "node:fs";

// Keep in step with src/lib/game/demo-areas.ts and GEOAPIFY_CATEGORIES in
// src/lib/places/geoapify-parse.ts (checked by demo-samples.test.ts).
export const AREAS = [
  { key: "fayetteville", file: "fayetteville", lat: 36.062, lng: -94.157 },
  { key: "los_angeles", file: "los-angeles", lat: 34.048, lng: -118.253 },
];
export const CATEGORIES = {
  food: ["catering.restaurant"],
  bars: ["catering.bar", "catering.pub", "catering.biergarten", "catering.taproom", "adult.nightclub"],
};

const OUT = "src/lib/places/fixtures/demo";
const RADIUS_M = 16_093; // 10 miles
const EVENT_DAYS = 14;

function needKey(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
  return value;
}

/** Drops Ticketmaster's link trees, which the app never reads. */
function prune(value) {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "_links").map(([k, v]) => [k, prune(v)]));
  }
  return value;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`${url.host} answered ${res.status}`);
  return res.json();
}

function save(name, body) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(body) + "\n");
}

async function recordPlaces() {
  const key = needKey("GEOAPIFY_API_KEY");
  for (const area of AREAS) {
    for (const [category, cats] of Object.entries(CATEGORIES)) {
      const url = new URL("https://api.geoapify.com/v2/places");
      url.searchParams.set("categories", cats.join(","));
      url.searchParams.set("filter", `circle:${area.lng},${area.lat},${RADIUS_M}`);
      url.searchParams.set("bias", `proximity:${area.lng},${area.lat}`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("lang", "en");
      const body = await getJson(url, { "x-api-key": key });
      save(`${area.file}-${category}`, body);
      console.log(`${area.key} ${category}: ${body.features?.length ?? 0} places`);
    }
  }
}

async function recordEvents() {
  const key = needKey("TICKETMASTER_API_KEY");
  const start = new Date();
  const end = new Date(start.getTime() + EVENT_DAYS * 86_400_000);
  const iso = (d) => d.toISOString().slice(0, 19) + "Z";
  for (const area of AREAS) {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("latlong", `${area.lat},${area.lng}`);
    url.searchParams.set("radius", "25");
    url.searchParams.set("unit", "miles");
    url.searchParams.set("startDateTime", iso(start));
    url.searchParams.set("endDateTime", iso(end));
    url.searchParams.set("size", "100");
    url.searchParams.set("sort", "date,asc");
    url.searchParams.set("apikey", key);
    const body = prune(await getJson(url));
    delete body.page;
    save(`${area.file}-events`, body);
    console.log(`${area.key} events: ${body._embedded?.events?.length ?? 0} events`);
  }
}

if (process.argv[1]?.endsWith("record-demo-samples.mjs")) {
  const args = process.argv.slice(2);
  const all = !args.includes("--places") && !args.includes("--events");
  if (all || args.includes("--places")) await recordPlaces();
  if (all || args.includes("--events")) await recordEvents();
}
