// The Yes / No tags for each category (final lists in docs/product-spec.md).
//
// Each tag lists the categories the data sources use for it. Restaurants and
// bars come from OpenStreetMap through Geoapify: an option matches a tag as
// "primary" when one of these is its main category (its first OSM cuisine,
// like "italian", or its bar type: bar, pub, nightclub, biergarten, taproom)
// and as "secondary" when it is one of its other categories (other cuisines,
// "vegetarian"/"vegan" from diet tags, "live_music", "sports_bar" from the
// sport tag). See src/lib/places/geoapify-parse.ts.
// Events come from Ticketmaster: primary is the segment or genre, secondary
// the subgenre. Tags with `keywords` also match by name or description, which
// counts as secondary; tags with only keywords are best effort.
//
// Checked against live Geoapify data (Austin, TX) on Nov 11, 2026. Bars carry
// little detail in OpenStreetMap, so most bar tags match by name keyword.

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
    t("italian", "Italian", ["italian", "pizza"]),
    t("mexican", "Mexican", ["mexican", "tex-mex", "tacos"]),
    t("asian", "Asian", ["chinese", "japanese", "thai", "korean", "vietnamese", "asian", "ramen", "noodle", "sushi", "dumpling", "taiwanese", "filipino", "indonesian", "malaysian"]),
    t("indian", "Indian", ["indian"]),
    t("mediterranean", "Mediterranean", ["mediterranean", "greek", "lebanese", "turkish", "middle_eastern", "arab", "persian", "moroccan", "syrian"]),
    t("american", "American", ["american", "diner", "texan", "cajun", "southern"]),
    t("burgers", "Burgers", ["burger"]),
    t("seafood", "Seafood", ["seafood", "fish", "fish_and_chips"]),
    t("steakhouse", "Steakhouse", ["steak_house"]),
    t("bbq", "BBQ", ["barbecue", "bbq"]),
    t("vegetarian", "Vegetarian", ["vegetarian", "vegan"]),
    t("fine_dining", "Fine dining", ["fine_dining"], ["fine dining", "tasting menu"]),
    t("breakfast", "Breakfast", ["breakfast"]),
    t("brunch", "Brunch", ["brunch"]),
  ],
  bars: [
    t("sports_bar", "Sports bar", ["sports_bar"], ["sports bar", "sports pub"]),
    t("cocktail_bar", "Cocktail bar", ["cocktail_bar", "cocktails"], ["cocktail", "cocktails", "speakeasy", "mixology"]),
    t("brewery", "Brewery", ["biergarten", "taproom", "brewery", "microbrewery"], ["brewery", "brewing", "taproom", "beer garden"]),
    t("wine_bar", "Wine bar", ["wine_bar"], ["wine bar", "wine"]),
    t("pub", "Pub", ["pub"]),
    t("club", "Club", ["nightclub"]),
    t("karaoke", "Karaoke", ["karaoke", "karaoke_box"], ["karaoke"]),
    t("live_music", "Live music", ["live_music"], ["live music"]),
    t("lounge", "Lounge", ["lounge"], ["lounge"]),
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

/** The picks screen's labels for the No and the Yes; both picks are optional (decided Nov 12, 2026). */
export function pickLabels(category: Category): { no: string; yes: string } {
  return { no: category === "events" ? "Not my ideal event" : "Not my ideal place", yes: "I’d like to go" };
}

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
