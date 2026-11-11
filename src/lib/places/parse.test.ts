import { describe, expect, it } from "vitest";
import { chooseOptions, combinePicks, type GameSettings } from "@/lib/game/scoring";
import { cuisineImage } from "@/lib/game/cuisine-images";
import food from "./fixtures/geoapify-food-sample.json";
import bars from "./fixtures/geoapify-bars-sample.json";
import tm from "./fixtures/ticketmaster-sample.json";
import { geoapifyCandidate, parseGeoapify } from "./geoapify-parse";
import { geohash, parseTicketmaster, ticketmasterCandidate } from "./ticketmaster-parse";
import { safeLink } from "./provider";

const center = { lat: 30.2672, lng: -97.7431 };
// Wed Nov 11, 2026, 7 pm in Austin.
const context = { now: new Date("2026-11-11T19:00:00-06:00"), timeZone: "America/Chicago" };
const byName = <T extends { name: string }>(list: T[], name: string) => list.find((c) => c.name === name)!;

describe("Geoapify (real Austin sample)", () => {
  const places = parseGeoapify(food, "food", center, context);

  it("keeps every named place and converts meters to miles", () => {
    expect(places.length).toBeGreaterThan(30);
    const modern = byName(places, "Modern Market Eatery");
    expect(modern.source).toBe("geoapify");
    expect(modern.distanceMi).toBeCloseTo(65 / 1609.344, 2);
    expect(modern.indoorOutdoor).toBe("outdoor"); // outdoor_seating=yes
  });

  it("uses the first OSM cuisine as primary and the rest as secondary", () => {
    const ginas = byName(places, "Gina's on Congress"); // cuisine=french;italian
    expect(ginas.primary).toEqual(["french"]);
    expect(ginas.secondary).toContain("italian");
    expect(ginas.card?.kind).toBe("French");
    expect(ginas.card?.link).toBe("https://www.ginasoncongress.com/");
  });

  it("reads opening hours as open now, closed, or unknown", () => {
    expect(byName(places, "CAVA").openNow).toBe(true); // Mo-Su 10:45-22:00 at 7 pm
    expect(places.some((p) => p.openNow === null)).toBe(true); // many have no hours
  });

  it("matches real places to the group's tags", () => {
    const pool = combinePicks("food", [
      { no: { tag: "seafood" }, yes: { tag: "mexican" } },
      { no: { tag: "steakhouse" }, yes: { tag: "italian" } },
      { no: { tag: "bbq" } },
    ]);
    const settings: GameSettings = { category: "food", radiusMi: 5, age: "all", indoorOutdoor: "either" };
    const { options, needsWidening } = chooseOptions(places, pool, settings);
    expect(needsWidening).toBe(false);
    expect(options).toHaveLength(6);
    for (const o of options) {
      expect(o.primary).not.toContain("seafood");
      expect(o.primary).not.toContain("steak_house");
    }
    // Places the group said Yes to come first.
    expect(["mexican", "italian", "pizza", "tex-mex"]).toContain(options[0].primary[0]);
  });

  it("gives bars their type, 21+ from min_age, and keyword tags by name", () => {
    const list = parseGeoapify(bars, "bars", center, context);
    expect(byName(list, "Parker Jazz Club").primary).toEqual(["nightclub"]);
    expect(byName(list, "The Pub").primary).toEqual(["pub"]);
    expect(byName(list, "Garage").adultsOnly).toBe(true);
    const pool = combinePicks("bars", [{ no: { tag: "club" }, yes: { tag: "cocktail_bar" } }]);
    const { options } = chooseOptions(list, pool, { category: "bars", radiusMi: 5, age: "21_plus", indoorOutdoor: "either" });
    // These match Cocktail bar by keyword (name or OSM description), so they rank first.
    expect(options.slice(0, 3).map((o) => o.name).sort()).toEqual(["CU29 Cocktail Bar", "Garage", "Speakeasy"]);
    expect(options.some((o) => o.primary.includes("nightclub"))).toBe(false);
  });

  it("chooses a local cuisine image from the place's categories", () => {
    const ginas = byName(places, "Gina's on Congress");
    const img = cuisineImage(ginas.card!.imageKeys!, "food", new Set(["italian", "restaurant-default"]));
    expect(img).toEqual({ src: "/images/restaurants/italian.jpg", illustrative: true });
  });

  it("treats diet=no as no match, and skips features without a name or id", () => {
    const base = { properties: { name: "Veg?", place_id: "abc123def456", lat: 30.27, lon: -97.74, distance: 100, categories: ["catering.restaurant"] } };
    const no = geoapifyCandidate({ properties: { ...base.properties, datasource: { raw: { "diet:vegetarian": "no" } } } }, "food", center, context);
    expect(no?.secondary).not.toContain("vegetarian");
    const yes = geoapifyCandidate({ properties: { ...base.properties, datasource: { raw: { "diet:vegetarian": "yes" } } } }, "food", center, context);
    expect(yes?.secondary).toContain("vegetarian");
    expect(geoapifyCandidate({ properties: { ...base.properties, name: "" } }, "food", center, context)).toBeNull();
    expect(geoapifyCandidate({ properties: { ...base.properties, place_id: "../x" } }, "food", center, context)).toBeNull();
  });

  it("rejects a response with no feature list", () => {
    expect(() => parseGeoapify({ error: "x" }, "food", center, context)).toThrow();
  });
});

describe("Ticketmaster (documented shape)", () => {
  const { candidates } = parseTicketmaster(tm);

  it("maps segment and genre to primary, subgenre to secondary", () => {
    const rock = byName(candidates, "Sample Rock Night");
    expect(rock.primary).toEqual(["Music", "Rock"]);
    expect(rock.secondary).toEqual(["Alternative Rock"]);
    expect(rock.eventDate).toBe("2026-11-14");
    expect(rock.adultsOnly).toBe(true);
    expect(rock.card).toMatchObject({ kind: "Rock · Music", venue: "Sample Hall", startTime: "20:00", address: "100 Example St, Austin, TX" });
  });

  it("picks a 16:9 Ticketmaster image near 640 px and never an outside host", () => {
    expect(byName(candidates, "Sample Rock Night").card?.imageUrl).toBe(
      "https://s1.ticketm.net/dam/a/000/sample_RECOMENDATION_16_9.jpg",
    );
  });

  it("drops unsafe links and Undefined genres, and skips broken events", () => {
    expect(byName(candidates, "Sample Comedy Hour").card?.link).toBeNull();
    expect(byName(candidates, "Sample Game").secondary).toEqual([]);
    expect(candidates).toHaveLength(3);
  });

  it("treats a response with no _embedded as no events", () => {
    expect(parseTicketmaster({ page: { totalElements: 0 } }).candidates).toEqual([]);
  });
});

describe("helpers", () => {
  it("rejects missing or out-of-range place coordinates and does not treat null distance as zero", () => {
    const props = { name: "Test place", place_id: "abc123def456", lat: 30.28, lon: -97.74, distance: null };
    for (const lat of [null, "", true, 91]) {
      expect(geoapifyCandidate({ properties: { ...props, lat } }, "food", center, context)).toBeNull();
    }
    expect(geoapifyCandidate({ properties: props }, "food", center, context)?.distanceMi).toBeGreaterThan(0);
  });

  it("skips invalid event distances and tolerates malformed per-event classifications", () => {
    const event = tm._embedded.events[0];
    for (const distance of [null, "", true, -1]) expect(ticketmasterCandidate({ ...event, distance })).toBeNull();
    expect(ticketmasterCandidate({ ...event, classifications: {} })?.name).toBe(event.name);
    expect(ticketmasterCandidate({ ...event, dates: { start: { localDate: "2026-02-30" } } })).toBeNull();
  });

  it("rejects credential-bearing links", () => {
    expect(safeLink("https://trusted.example:password@evil.example/")).toBeNull();
  });
  it("geohash matches a known value", () => {
    expect(geohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
  });

  it("safeLink keeps only http(s)", () => {
    expect(safeLink("https://example.com/a")).toBe("https://example.com/a");
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("data:text/html,x")).toBeNull();
    expect(safeLink(42)).toBeNull();
  });
});
