import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DEMO_AREAS, demoNow, nearestDemoArea } from "@/lib/game/demo-areas";
import { chooseOptions, combinePicks } from "@/lib/game/scoring";
import { AREAS, CATEGORIES, cleanEvents, geohash as recorderGeohash } from "../../../scripts/record-demo-samples.mjs";
import sampleEvents from "@/lib/places/fixtures/ticketmaster-sample.json";
import { geohash, parseTicketmaster } from "@/lib/places/ticketmaster-parse";
import { GEOAPIFY_CATEGORIES } from "@/lib/places/geoapify-parse";
import { demoSearch } from "./demo-search";

describe("demo areas", () => {
  it("each phone-side area matches the recorder's", () => {
    expect(AREAS.map((a: { key: string; lat: number; lng: number }) => [a.key, a.lat, a.lng])).toEqual(
      DEMO_AREAS.map((a) => [a.key, a.lat, a.lng]),
    );
    expect(CATEGORIES).toEqual(GEOAPIFY_CATEGORIES);
    for (const a of DEMO_AREAS) expect(recorderGeohash(a.lat, a.lng)).toBe(geohash(a.lat, a.lng));
  });

  it("finds the area a game's center belongs to", () => {
    expect(nearestDemoArea(36.06, -94.16).key).toBe("fayetteville");
    expect(nearestDemoArea(34.05, -118.25).key).toBe("los_angeles");
  });
});

describe("demo clock", () => {
  it("replays a Friday at 7 pm in each area", () => {
    for (const a of DEMO_AREAS) {
      const local = new Intl.DateTimeFormat("en-US", { timeZone: a.timeZone, weekday: "short", hour: "numeric", hour12: false }).format(demoNow(a.timeZone));
      expect(local).toBe("Fri, 19");
    }
  });
});

describe("recorded events", () => {
  it("keep what the parser needs (page counts) and drop the link trees", () => {
    const raw = {
      ...sampleEvents,
      _links: { self: { href: "https://example.test" } },
      page: { size: 100, totalElements: 2, totalPages: 1, number: 0 },
    };
    const saved = cleanEvents(raw);
    expect(JSON.stringify(saved)).not.toContain("_links");
    expect(parseTicketmaster(saved).candidates.length).toBeGreaterThan(0);
  });

  it("an empty answer saves as no events, not a broken file", () => {
    const saved = cleanEvents({ page: { size: 100, totalElements: 0, totalPages: 0, number: 0 } });
    expect(parseTicketmaster(saved).candidates).toEqual([]);
  });
});

describe("demoSearch", () => {
  for (const area of DEMO_AREAS) {
    for (const category of ["food", "bars"] as const) {
      it(`${area.label} ${category}: local places, measured from the demo spot, three full rounds`, () => {
        const { candidates } = demoSearch(category, null, area);
        expect(candidates.length).toBeGreaterThan(20);
        expect(Math.max(...candidates.map((c) => c.distanceMi))).toBeLessThan(10.5);
        // With nobody's picks and the default 5 mi (widening to 10), every
        // round of a 3-round game fills, whatever the real time of day.
        const settings = { category, radiusMi: 5, age: "all" as const, indoorOutdoor: "either" as const };
        const pool = combinePicks(category, []);
        const shown = new Set<string>();
        for (let round = 1; round <= 3; round++) {
          const at5 = chooseOptions(candidates, pool, settings, { radiusMi: 5, alreadyShown: shown });
          const filled = at5.needsWidening ? chooseOptions(candidates, pool, settings, { radiusMi: 10, alreadyShown: shown }) : at5;
          expect(filled.options, `round ${round}`).toHaveLength(6);
          for (const o of filled.options) shown.add(`${o.source}:${o.sourceId}`);
        }
      });
    }
  }

  it("keeps the two areas' places apart", () => {
    const fay = new Set(demoSearch("food", null, DEMO_AREAS[0]).candidates.map((c) => c.sourceId));
    const la = demoSearch("food", null, DEMO_AREAS[1]).candidates.map((c) => c.sourceId);
    expect(la.some((id) => fay.has(id))).toBe(false);
  });

  for (const area of DEMO_AREAS) {
    it(`${area.label} events: saved and readable`, () => {
      const { candidates } = demoSearch("events", "2026-12-01", area);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((c) => c.name && c.source === "ticketmaster")).toBe(true);
    });
  }

  it("gives events the game's date", () => {
    const { candidates } = demoSearch("events", "2026-12-01", DEMO_AREAS[0]);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.eventDate === "2026-12-01")).toBe(true);
  });
});
