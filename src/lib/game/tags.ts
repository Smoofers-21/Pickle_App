// The Yes / No tags for each category (final lists in docs/product-spec.md).
//
// Each tag lists the categories the data sources use for it. An option
// matches a tag as "primary" when one of these is its main category (a
// Google place's primary type, a Ticketmaster event's segment or genre) and
// as "secondary" when it is one of its other categories (other Google types,
// the Ticketmaster subgenre). Tags with `keywords` also match by name or
// description, which counts as secondary.
//
// The exact Google type names are checked against the API in milestone 4.

export type Category = "food" | "bars" | "events";

export type TagDef = {
  key: string;
  label: string;
  categories: string[];
  keywords?: string[];
};

const t = (key: string, label: string, categories: string[], keywords?: string[]): TagDef => ({
  key,
  label,
  categories,
  keywords,
});

export const TAGS: Record<Category, TagDef[]> = {
  food: [
    t("italian", "Italian", ["italian_restaurant"]),
    t("mexican", "Mexican", ["mexican_restaurant", "tex_mex_restaurant"]),
    t("asian", "Asian", [
      "chinese_restaurant",
      "japanese_restaurant",
      "thai_restaurant",
      "korean_restaurant",
      "vietnamese_restaurant",
      "asian_restaurant",
      "ramen_restaurant",
      "sushi_restaurant",
    ]),
    t("indian", "Indian", ["indian_restaurant"]),
    t("mediterranean", "Mediterranean", ["mediterranean_restaurant", "greek_restaurant", "middle_eastern_restaurant"]),
    t("american", "American", ["american_restaurant", "diner"]),
    t("burgers", "Burgers", ["hamburger_restaurant"]),
    t("seafood", "Seafood", ["seafood_restaurant"]),
    t("steakhouse", "Steakhouse", ["steak_house"]),
    t("bbq", "BBQ", ["barbecue_restaurant"]),
    t("vegetarian", "Vegetarian", ["vegetarian_restaurant", "vegan_restaurant"]),
    t("fine_dining", "Fine dining", ["fine_dining_restaurant"]),
    t("breakfast", "Breakfast", ["breakfast_restaurant"]),
    t("brunch", "Brunch", ["brunch_restaurant"]),
  ],
  bars: [
    t("sports_bar", "Sports bar", ["sports_bar"]),
    t("cocktail_bar", "Cocktail bar", ["cocktail_bar", "lounge_bar"]),
    t("brewery", "Brewery", ["brewery", "brewpub", "beer_garden"]),
    t("wine_bar", "Wine bar", ["wine_bar"]),
    t("pub", "Pub", ["pub", "irish_pub"]),
    t("club", "Club", ["night_club"]),
    t("karaoke", "Karaoke", ["karaoke"]),
    t("live_music", "Live music", ["live_music_venue"]),
    t("lounge", "Lounge", ["lounge_bar"]),
    t("rooftop", "Rooftop", [], ["rooftop", "roof top", "sky bar", "skybar"]),
  ],
  events: [
    t("country", "Country", ["Country"]),
    t("pop", "Pop", ["Pop"]),
    t("hip_hop", "Hip-hop", ["Hip-Hop/Rap"]),
    t("rock", "Rock", ["Rock", "Alternative", "Metal"]),
    t("edm", "EDM", ["Dance/Electronic"]),
    t("rnb", "R&B", ["R&B"]),
    t("latin", "Latin", ["Latin"]),
    t("jazz", "Jazz", ["Jazz", "Blues"]),
    t("comedy", "Comedy", ["Comedy"]),
    t("theater", "Theater", ["Theatre", "Musical"]),
    t("sports", "Sports", ["Sports"]),
    t("family", "Family", ["Family"]),
  ],
};

export const CATEGORY_LABELS: Record<Category, string> = { food: "Food", bars: "Bars", events: "Events" };

export function isCategory(value: unknown): value is Category {
  return value === "food" || value === "bars" || value === "events";
}

export function findTag(category: Category, key: string): TagDef | undefined {
  return TAGS[category].find((tag) => tag.key === key);
}

/** The free-text "+ Other" field: 1–30 letters, numbers, spaces and simple punctuation. */
export const OTHER_MAX = 30;
export function cleanOther(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (text.length < 1 || text.length > OTHER_MAX) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M} '&.\-/]*$/u.test(text)) return null;
  return text;
}
