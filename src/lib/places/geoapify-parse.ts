// Turns a Geoapify Places response (OpenStreetMap data) into Candidates.
// Pure code with no network or keys, so it is tested on a saved real
// response (fixtures/). Checked against the live API on Nov 11, 2026:
//   - properties.categories holds Geoapify keys such as
//     "catering.restaurant.italian" and conditions such as "vegetarian".
//   - properties.datasource.raw holds the OSM tags: amenity, cuisine
//     (semicolon list), opening_hours, outdoor_seating, min_age, diet:*, ...
//   - properties.distance is meters from the bias point (the search center).

import type { Candidate } from "@/lib/game/scoring";
import { isOpenNow } from "./opening-hours";
import { cleanText, distanceMi, finiteNumber, METERS_PER_MILE, safeLink, type PlacesCategory, type SearchContext } from "./provider";

/** Geoapify categories searched for each Pickle category. */
export const GEOAPIFY_CATEGORIES: Record<PlacesCategory, string[]> = {
  food: ["catering.restaurant"],
  bars: ["catering.bar", "catering.pub", "catering.biergarten", "catering.taproom", "adult.nightclub"],
};

const BAR_TYPE_BY_CATEGORY: [string, string][] = [
  ["adult.nightclub", "nightclub"],
  ["catering.biergarten", "biergarten"],
  ["catering.taproom", "taproom"],
  ["catering.pub", "pub"],
  ["catering.bar", "bar"],
];

const KIND_LABELS: Record<string, string> = {
  steak_house: "Steakhouse",
  barbecue: "BBQ",
  bbq: "BBQ",
  "tex-mex": "Tex-Mex",
  fine_dining: "Fine dining",
  coffee_shop: "Coffee",
  biergarten: "Beer garden",
  nightclub: "Nightclub",
  taproom: "Taproom",
  pub: "Pub",
  bar: "Bar",
};

const YES = new Set(["yes", "only", "true", "1"]);

type Raw = Record<string, unknown>;
type Props = {
  name?: unknown;
  categories?: unknown;
  formatted?: unknown;
  address_line2?: unknown;
  website?: unknown;
  opening_hours?: unknown;
  distance?: unknown;
  place_id?: unknown;
  lat?: unknown;
  lon?: unknown;
  catering?: { cuisine?: unknown };
  facilities?: { outdoor_seating?: unknown };
  datasource?: { raw?: Raw };
};

/** "italian;pizza" → ["italian", "pizza"]. */
function cuisineList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[;,]/)
    .map((c) => c.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter((c) => /^[a-z0-9_-]{2,30}$/.test(c));
}

const isYes = (value: unknown) => typeof value === "string" && YES.has(value.toLowerCase());

export function kindLabel(token: string | undefined, category: PlacesCategory): string {
  if (!token) return category === "bars" ? "Bar" : "Restaurant";
  return Object.hasOwn(KIND_LABELS, token) ? KIND_LABELS[token] : token.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** One Geoapify feature → a Candidate, or null if it has no name or position. */
export function geoapifyCandidate(
  feature: unknown,
  category: PlacesCategory,
  center: { lat: number; lng: number },
  context: SearchContext,
): Candidate | null {
  const p = (feature as { properties?: Props } | null)?.properties;
  if (!p || typeof p !== "object") return null;
  const name = cleanText(p.name, 80);
  const placeId = typeof p.place_id === "string" && /^[0-9a-f]{8,200}$/i.test(p.place_id) ? p.place_id : null;
  const lat = finiteNumber(p.lat);
  const lng = finiteNumber(p.lon);
  if (!name || !placeId || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const raw: Raw = p.datasource?.raw && typeof p.datasource.raw === "object" ? p.datasource.raw : {};
  const categories = Array.isArray(p.categories) ? p.categories.filter((c): c is string => typeof c === "string") : [];

  const cuisines = cuisineList(raw.cuisine ?? p.catering?.cuisine);
  if (cuisines.length === 0) {
    // No OSM cuisine: use Geoapify's own cuisine category, if any.
    for (const c of categories) {
      const m = /^catering\.(?:restaurant|fast_food)\.([a-z_-]+)$/.exec(c);
      if (m) cuisines.push(m[1]);
    }
  }

  const primary: string[] = [];
  const secondary: string[] = [];
  if (category === "bars") {
    const barType = BAR_TYPE_BY_CATEGORY.find(([key]) => categories.includes(key))?.[1] ?? "bar";
    primary.push(barType);
    secondary.push(...cuisines);
  } else {
    if (cuisines[0]) primary.push(cuisines[0]);
    secondary.push(...cuisines.slice(1));
  }

  // Diets: only an explicit yes/only counts ("diet:vegetarian=no" must not match).
  for (const diet of ["vegetarian", "vegan"]) {
    if (isYes(raw[`diet:${diet}`]) || categories.includes(diet) || categories.includes(`${diet}.only`)) {
      secondary.push(diet);
    }
  }
  if (isYes(raw.live_music)) secondary.push("live_music");
  if (isYes(raw.karaoke)) secondary.push("karaoke");
  if (isYes(raw.microbrewery)) secondary.push("microbrewery");
  if (typeof raw.sport === "string" && raw.sport) secondary.push("sports_bar");

  const outdoor = isYes(raw.outdoor_seating) || p.facilities?.outdoor_seating === true || primary[0] === "biergarten";
  const indoorOnly = !outdoor && isYes(raw.indoor_seating) && raw.outdoor_seating === "no";
  const minAge = finiteNumber(raw.min_age);

  const meters = finiteNumber(p.distance);
  const miles = meters !== null && meters >= 0 ? meters / METERS_PER_MILE : distanceMi(center.lat, center.lng, lat, lng);
  const hours = cleanText(p.opening_hours ?? raw.opening_hours, 300);

  return {
    source: "geoapify",
    sourceId: placeId,
    name,
    primary: [...new Set(primary)],
    secondary: [...new Set(secondary.filter((s) => !primary.includes(s)))],
    text: [cleanText(raw.description, 200), cleanText(raw.brand, 60)].filter(Boolean).join(" ") || undefined,
    distanceMi: Math.round(miles * 100) / 100,
    indoorOutdoor: outdoor ? "outdoor" : indoorOnly ? "indoor" : null,
    adultsOnly: minAge !== null && minAge >= 21 ? true : null,
    openNow: isOpenNow(hours, context.now, context.timeZone),
    card: {
      kind: kindLabel(primary[0], category),
      address: cleanText(p.address_line2, 160) ?? cleanText(p.formatted, 160),
      link: safeLink(p.website ?? raw.website),
      imageKeys: [...primary, ...secondary],
      hours,
      lat,
      lng,
    },
  };
}

/** A whole Geoapify response → Candidates (bad or unnamed features are skipped). */
export function parseGeoapify(
  body: unknown,
  category: PlacesCategory,
  center: { lat: number; lng: number },
  context: SearchContext,
): Candidate[] {
  const features = (body as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new Error("Unexpected places response");
  const out: Candidate[] = [];
  for (const f of features) {
    const c = geoapifyCandidate(f, category, center, context);
    if (c) out.push(c);
  }
  return out;
}
