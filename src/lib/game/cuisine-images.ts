// Picks the illustrative cuisine image for a restaurant or bar card (see
// "Cuisine images" in docs/build-plan.md). Images are files in
// public/images/restaurants/; nothing is ever fetched from a places API.

import { AVAILABLE_CUISINE_IMAGES } from "./cuisine-images.generated";

/** OpenStreetMap cuisine values and bar types → image key. */
const KEY_FOR: Record<string, string> = {
  italian: "italian",
  pizza: "pizza",
  mexican: "mexican",
  "tex-mex": "mexican",
  chinese: "chinese",
  japanese: "japanese",
  ramen: "japanese",
  sushi: "sushi",
  thai: "thai",
  korean: "korean",
  vietnamese: "vietnamese",
  asian: "chinese",
  noodle: "chinese",
  indian: "indian",
  mediterranean: "mediterranean",
  greek: "greek",
  lebanese: "middle-eastern",
  turkish: "middle-eastern",
  middle_eastern: "middle-eastern",
  kebab: "middle-eastern",
  american: "american",
  diner: "american",
  burger: "burger",
  seafood: "seafood",
  fish: "seafood",
  steak_house: "steakhouse",
  barbecue: "bbq",
  bbq: "bbq",
  vegetarian: "vegetarian",
  vegan: "vegetarian",
  breakfast: "breakfast",
  brunch: "brunch",
  coffee_shop: "cafe",
  cafe: "cafe",
  fine_dining: "fine-dining",
  pub: "pub",
  biergarten: "brewery",
  brewery: "brewery",
  microbrewery: "brewery",
  cocktail_bar: "cocktail-bar",
  wine_bar: "wine-bar",
  nightclub: "nightclub",
  sports_bar: "sports-bar",
  karaoke: "karaoke",
  karaoke_box: "karaoke",
  live_music: "live-music",
  rooftop: "rooftop",
};

/** When an image isn't in the library yet, try these instead (in order). */
const FALLBACK: Record<string, string> = {
  greek: "mediterranean",
  "middle-eastern": "mediterranean",
  brunch: "breakfast",
  brewery: "pub",
};

export type ImageCategory = "food" | "bars";

export type CuisineImage = { src: string; illustrative: true } | null;

function resolve(key: string, available: ReadonlySet<string>): string | null {
  for (let k: string | undefined = key; k; k = FALLBACK[k]) {
    if (available.has(k)) return k;
  }
  return null;
}

/**
 * The image for a place, from its OSM cuisines / bar types (most specific
 * first). Falls back to the restaurant or bar default, and to null (a plain
 * placeholder) if even that hasn't been added yet.
 */
export function cuisineImage(
  categories: string[],
  kind: ImageCategory,
  available: ReadonlySet<string> = AVAILABLE_CUISINE_IMAGES,
): CuisineImage {
  for (const c of categories) {
    const key = KEY_FOR[c.toLowerCase()];
    const found = key && resolve(key, available);
    if (found) return { src: `/images/restaurants/${found}.jpg`, illustrative: true };
  }
  const fallback = kind === "bars" ? "bar-default" : "restaurant-default";
  return available.has(fallback) ? { src: `/images/restaurants/${fallback}.jpg`, illustrative: true } : null;
}
