// Records the saved sample searches for demo mode (milestone 8): food, bars
// and events around each demo area in src/lib/game/demo-areas.ts. Demo
// games then show these real local places and events without calling the
// APIs or spending credits. Run again shortly before a demo so the events
// are current.
//
//   GEOAPIFY_API_KEY=... TICKETMASTER_API_KEY=... node scripts/record-demo-samples.mjs [--places] [--events]
//
// With neither flag it records both. Events are normally recorded by the
// "Record demo events" GitHub Action, since Ticketmaster takes its key in the
// URL. Keys come only from the environment
// and are never written to the samples or printed. Costs per run: 5
// Geoapify credits per area and category, 1 Ticketmaster call per area.

import { mkdirSync, writeFileSync } from "node:fs";

// Keep in step with src/lib/game/demo-areas.ts and GEOAPIFY_CATEGORIES in
// src/lib/places/geoapify-parse.ts (checked by demo-samples.test.ts).
// eventRadiusMi: how far to look for events. Fayetteville looks across
// Northwest Arkansas (Rogers, Bentonville, Springdale): within 25 mi
// Ticketmaster listed only 4 events in two weeks (Nov 18, 2026).
export const AREAS = [
  { key: "fayetteville", file: "fayetteville", lat: 36.062, lng: -94.157, eventRadiusMi: 50 },
  { key: "los_angeles", file: "los-angeles", lat: 34.048, lng: -118.253, eventRadiusMi: 25 },
];
export const CATEGORIES = {
  food: ["catering.restaurant"],
  bars: ["catering.bar", "catering.pub", "catering.biergarten", "catering.taproom", "adult.nightclub"],
};

const OUT = "src/lib/places/fixtures/demo";
const RADIUS_M = 16_093; // 10 miles
const EVENT_DAYS = 30;

function needKey(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
  return value;
}

/**
 * A Ticketmaster answer as saved for demo mode: link trees dropped, but the
 * page counts kept, because the app's parser checks them (Codex, PR 22).
 */
export function cleanEvents(body) {
  const { page, ...rest } = prune(body);
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { ...rest, page: { size: n(page?.size), totalElements: n(page?.totalElements), totalPages: n(page?.totalPages), number: n(page?.number) } };
}

/** The same geohash the app sends Ticketmaster (ticketmaster-parse.ts; checked by a test). */
export function geohash(lat, lng, precision = 9) {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    const range = even ? lngRange : latRange;
    const value = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (value >= mid) {
      ch = (ch << 1) | 1;
      if (even) lngRange = [mid, range[1]];
      else latRange = [mid, range[1]];
    } else {
      ch <<= 1;
      if (even) lngRange = [range[0], mid];
      else latRange = [range[0], mid];
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
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
  const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(20_000) });
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
    url.searchParams.set("geoPoint", geohash(area.lat, area.lng));
    url.searchParams.set("radius", String(area.eventRadiusMi));
    url.searchParams.set("unit", "miles");
    url.searchParams.set("startDateTime", iso(start));
    url.searchParams.set("endDateTime", iso(end));
    url.searchParams.set("size", "100");
    url.searchParams.set("sort", "date,asc");
    url.searchParams.set("apikey", key);
    const body = cleanEvents(await getJson(url));
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
