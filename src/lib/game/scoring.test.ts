import { describe, expect, it } from "vitest";
import {
  chooseOptions,
  combinePicks,
  dedupe,
  distancePoints,
  filterCandidates,
  matchStrength,
  normalizeName,
  ratingPoints,
  score,
  type Candidate,
  type GameSettings,
  type Pool,
} from "./scoring";

const food: GameSettings = { category: "food", radiusMi: 5, age: "all", indoorOutdoor: "either" };
const events: GameSettings = { category: "events", radiusMi: 10, age: "all", indoorOutdoor: "either", eventDate: "2026-11-14" };
const emptyPool: Pool = { yes: [], no: [], cancelled: [] };

const place = (name: string, primary: string, extra: Partial<Candidate> = {}): Candidate => ({
  source: "google",
  sourceId: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  primary: [primary],
  secondary: ["restaurant", "food"],
  distanceMi: 1,
  rating: 4.5,
  openToday: true,
  ...extra,
});

const event = (name: string, genre: string, extra: Partial<Candidate> = {}): Candidate => ({
  source: "ticketmaster",
  sourceId: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  primary: ["Music", genre],
  secondary: [],
  distanceMi: 3,
  rating: null,
  eventDate: "2026-11-14",
  ...extra,
});

describe("combinePicks", () => {
  it("counts each Yes and No", () => {
    const pool = combinePicks("food", [
      { no: { tag: "seafood" }, yes: { tag: "italian" } },
      { no: { tag: "seafood" }, yes: { tag: "italian" } },
      { no: { tag: "bbq" } },
    ]);
    expect(pool.yes).toMatchObject([{ key: "tag:italian", count: 2 }]);
    expect(pool.no.map((e) => [e.key, e.count])).toEqual([
      ["tag:seafood", 2],
      ["tag:bbq", 1],
    ]);
  });

  it("drops a tag that is one member's Yes and another's No (cancel-out)", () => {
    const pool = combinePicks("events", [
      { no: { tag: "country" }, yes: { tag: "pop" } },
      { no: { tag: "pop" }, yes: { tag: "rock" } },
      { no: { tag: "comedy" }, yes: { tag: "pop" } },
    ]);
    expect(pool.cancelled).toEqual(["tag:pop"]);
    expect(pool.yes.map((e) => e.key)).toEqual(["tag:rock"]);
    expect(pool.no.map((e) => e.key)).toEqual(["tag:country", "tag:comedy"]);
  });

  it("cancels matching Other text too, ignoring case and punctuation", () => {
    const pool = combinePicks("food", [
      { no: { tag: "bbq" }, yes: { other: "Dim sum" } },
      { no: { other: "dim-sum!" } },
    ]);
    expect(pool.cancelled).toEqual(["other:dim sum"]);
    expect(pool.yes).toEqual([]);
  });

  it("ignores tags that aren't in the category's list", () => {
    const pool = combinePicks("food", [{ no: { tag: "country" } }]);
    expect(pool.no).toEqual([]);
  });
});

describe("matchStrength", () => {
  const pool = (picks: Parameters<typeof combinePicks>[1], category: GameSettings["category"] = "food") =>
    combinePicks(category, picks);

  it("is primary for the main type and secondary for other types", () => {
    const [italian] = pool([{ no: { tag: "bbq" }, yes: { tag: "italian" } }]).yes;
    expect(matchStrength(italian, place("Trattoria", "italian_restaurant"))).toBe("primary");
    expect(matchStrength(italian, place("Pizza Co", "pizza_restaurant", { secondary: ["italian_restaurant"] }))).toBe("secondary");
    expect(matchStrength(italian, place("Taqueria", "mexican_restaurant"))).toBeNull();
  });

  it("treats a country-only concert as primary and country-pop as secondary", () => {
    const [country] = pool([{ no: { tag: "country" } }], "events").no;
    expect(matchStrength(country, event("Country Night", "Country"))).toBe("primary");
    expect(matchStrength(country, event("Pop Star", "Pop", { secondary: ["Country"] }))).toBe("secondary");
  });

  it("matches Rooftop by keyword", () => {
    const [rooftop] = pool([{ no: { tag: "pub" }, yes: { tag: "rooftop" } }], "bars").yes;
    expect(matchStrength(rooftop, place("The Rooftop at 5th", "bar"))).toBe("secondary");
    expect(matchStrength(rooftop, place("Cellar Bar", "bar"))).toBeNull();
  });

  it("matches Other text as a whole word in the name or types", () => {
    const [other] = pool([{ no: { tag: "bbq" }, yes: { other: "Ramen" } }]).yes;
    expect(matchStrength(other, place("Ramen House", "japanese_restaurant"))).toBe("secondary");
    expect(matchStrength(other, place("Noodle Bar", "ramen_restaurant"))).toBe("secondary");
    expect(matchStrength(other, place("Ramenski's Deli", "deli"))).toBeNull();
  });
});

describe("score", () => {
  it("starts at 50 plus rating and distance points", () => {
    // 50 + rating 4.5 (10) + distance 1 of 5 mi (8)
    expect(score(place("A", "cafe"), emptyPool, food, 5)).toBe(68);
  });

  it("applies Yes boosts and scaled No penalties per member", () => {
    const pool = combinePicks("food", [
      { no: { tag: "seafood" }, yes: { tag: "italian" } },
      { no: { tag: "seafood" }, yes: { tag: "italian" } },
    ]);
    expect(score(place("Trattoria", "italian_restaurant"), pool, food, 5)).toBe(98); // 68 + 2×15
    expect(score(place("Fish House", "seafood_restaurant"), pool, food, 5)).toBe(0); // 68 − 2×40, floored
    expect(score(place("Surf & Turf", "steak_house", { secondary: ["seafood_restaurant"] }), pool, food, 5)).toBe(48); // 68 − 2×10
  });

  it("adds 5 when indoor/outdoor matches the host's choice", () => {
    const outdoor = { ...food, indoorOutdoor: "outdoor" as const };
    expect(score(place("Patio", "cafe", { indoorOutdoor: "outdoor" }), emptyPool, outdoor, 5)).toBe(73);
    expect(score(place("Inside", "cafe", { indoorOutdoor: "indoor" }), emptyPool, outdoor, 5)).toBe(68);
  });

  it("stays between 0 and 100", () => {
    const pool = combinePicks("food", Array.from({ length: 10 }, () => ({ no: { tag: "bbq" }, yes: { tag: "italian" } })));
    expect(score(place("Trattoria", "italian_restaurant"), pool, food, 5)).toBe(100);
  });
});

describe("rating and distance points", () => {
  it("gives full rating points at 4.5+, none at 3.0 or less, half when unknown", () => {
    expect(ratingPoints(4.8)).toBe(10);
    expect(ratingPoints(3.75)).toBeCloseTo(5);
    expect(ratingPoints(2.9)).toBe(0);
    expect(ratingPoints(null)).toBe(5);
  });

  it("gives full distance points when closest, none at the radius", () => {
    expect(distancePoints(0, 5)).toBe(10);
    expect(distancePoints(2.5, 5)).toBe(5);
    expect(distancePoints(7, 5)).toBe(0);
  });
});

describe("filterCandidates", () => {
  it("keeps places open today, within the radius, and not shown before", () => {
    const list = [
      place("Open", "cafe"),
      place("Closed", "cafe", { openToday: false }),
      place("Unknown hours", "cafe", { openToday: null }),
      place("Far", "cafe", { distanceMi: 9 }),
      place("Shown", "cafe"),
    ];
    const kept = filterCandidates(list, food, 5, new Set(["google:shown"]));
    expect(kept.map((c) => c.name)).toEqual(["Open", "Unknown hours"]);
  });

  it("keeps only events on the chosen date", () => {
    const kept = filterCandidates([event("Fri", "Pop"), event("Sat", "Pop", { eventDate: "2026-11-15" })], events, 10);
    expect(kept.map((c) => c.name)).toEqual(["Fri"]);
  });

  it("drops 21+ venues unless the host allowed them", () => {
    const list = [place("Club", "night_club", { adultsOnly: true }), place("Cafe", "cafe")];
    expect(filterCandidates(list, food, 5).map((c) => c.name)).toEqual(["Cafe"]);
    expect(filterCandidates(list, { ...food, age: "21_plus" }, 5)).toHaveLength(2);
  });
});

describe("normalizeName and dedupe", () => {
  it("strips case, punctuation, accents and location suffixes", () => {
    expect(normalizeName("Chipotle Mexican Grill - Main St.")).toBe("chipotle mexican grill");
    expect(normalizeName("CHIPOTLE MEXICAN GRILL (Downtown)")).toBe("chipotle mexican grill");
    expect(normalizeName("Café Olé")).toBe("cafe ole");
    expect(normalizeName("Joe's Bar & Grill")).toBe("joe s bar and grill");
  });

  it("keeps the closest location of each chain", () => {
    const kept = dedupe([
      place("Chipotle - Main St", "mexican_restaurant", { sourceId: "a", distanceMi: 3 }),
      place("Chipotle (Downtown)", "mexican_restaurant", { sourceId: "b", distanceMi: 1.2 }),
      place("Taqueria", "mexican_restaurant", { sourceId: "c", distanceMi: 2 }),
    ]);
    expect(kept.map((c) => c.sourceId).sort()).toEqual(["b", "c"]);
  });
});

describe("chooseOptions", () => {
  const list = [
    place("Trattoria Roma", "italian_restaurant", { distanceMi: 0.5 }),
    place("Pasta Bar", "italian_restaurant", { distanceMi: 2, rating: 4.2 }),
    place("Fish House", "seafood_restaurant", { distanceMi: 0.3 }),
    place("Thai Palace", "thai_restaurant", { distanceMi: 1.5, rating: 4.6 }),
    place("Diner 24", "diner", { distanceMi: 4.8, rating: 3.1 }),
    place("Burger Barn", "hamburger_restaurant", { distanceMi: 1, rating: 4.0 }),
    place("Taco Spot", "mexican_restaurant", { distanceMi: 0.8, rating: 4.4 }),
    place("Curry Corner", "indian_restaurant", { distanceMi: 2.5, rating: 4.7 }),
    place("Night Owl", "cafe", { openToday: false }),
  ];
  const pool = combinePicks("food", [
    { no: { tag: "seafood" }, yes: { tag: "italian" } },
    { no: { tag: "american" } },
  ]);

  it("returns the best options at or above the threshold, highest first", () => {
    const { options, needsWidening } = chooseOptions(list, pool, food);
    expect(options.map((o) => o.name)).toEqual([
      "Trattoria Roma", // 50 + 15 Yes + 10 rating + 9 distance = 84
      "Pasta Bar", // 50 + 15 + 8 + 6 = 79
      "Taco Spot", // 50 + 9.3 + 8.4 = 68
      "Thai Palace", // 50 + 10 + 7 = 67
      "Burger Barn", // 65, ties with Curry Corner but is closer
      "Curry Corner", // 65
    ]);
    expect(options.every((o) => o.score >= 60)).toBe(true);
    expect(needsWidening).toBe(false);
  });

  it("asks to widen when fewer than 6 qualify", () => {
    const { options, needsWidening } = chooseOptions(list.slice(0, 4), pool, food);
    expect(options).toHaveLength(3); // Fish House is pushed below the threshold by the No
    expect(needsWidening).toBe(true);
  });

  it("never repeats an option shown in an earlier round", () => {
    const shown = new Set(["google:trattoria-roma"]);
    const { options } = chooseOptions(list, pool, food, { alreadyShown: shown });
    expect(options.map((o) => o.name)).not.toContain("Trattoria Roma");
  });
});
