import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DEMO_AREAS, nearestDemoArea } from "@/lib/game/demo-areas";
import { chooseOptions, combinePicks } from "@/lib/game/scoring";
import { AREAS, CATEGORIES } from "../../../scripts/record-demo-samples.mjs";
import { GEOAPIFY_CATEGORIES } from "@/lib/places/geoapify-parse";
import { demoSearch } from "./demo-search";

// 7 pm on a Friday in each area, so "open now" is realistic and stable.
const EVENING: Record<string, Date> = {
  fayetteville: new Date("2026-11-21T01:00:00Z"),
  los_angeles: new Date("2026-11-21T03:00:00Z"),
};

describe("demo areas", () => {
  it("each phone-side area matches the recorder's", () => {
    expect(AREAS.map((a: { key: string; lat: number; lng: number }) => [a.key, a.lat, a.lng])).toEqual(
      DEMO_AREAS.map((a) => [a.key, a.lat, a.lng]),
    );
    expect(CATEGORIES).toEqual(GEOAPIFY_CATEGORIES);
  });

  it("finds the area a game's center belongs to", () => {
    expect(nearestDemoArea(36.06, -94.16).key).toBe("fayetteville");
    expect(nearestDemoArea(34.05, -118.25).key).toBe("los_angeles");
  });
});

describe("demoSearch", () => {
  for (const area of DEMO_AREAS) {
    for (const category of ["food", "bars"] as const) {
      it(`${area.label} ${category}: local places, measured from the demo spot, enough for a round`, () => {
        const { candidates } = demoSearch(category, null, area, EVENING[area.key]);
        expect(candidates.length).toBeGreaterThan(20);
        expect(Math.max(...candidates.map((c) => c.distanceMi))).toBeLessThan(10.5);
        // With nobody's picks and the default 5 mi (widening to 10), a round still fills.
        const settings = { category, radiusMi: 5, age: "all" as const, indoorOutdoor: "either" as const };
        const pool = combinePicks(category, []);
        const at5 = chooseOptions(candidates, pool, settings, { radiusMi: 5 });
        const filled = at5.needsWidening ? chooseOptions(candidates, pool, settings, { radiusMi: 10 }) : at5;
        expect(filled.options).toHaveLength(6);
      });
    }
  }

  it("keeps the two areas' places apart", () => {
    const fay = new Set(demoSearch("food", null, DEMO_AREAS[0]).candidates.map((c) => c.sourceId));
    const la = demoSearch("food", null, DEMO_AREAS[1]).candidates.map((c) => c.sourceId);
    expect(la.some((id) => fay.has(id))).toBe(false);
  });

  it("gives events the game's date", () => {
    const { candidates } = demoSearch("events", "2026-12-01", DEMO_AREAS[0]);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.eventDate === "2026-12-01")).toBe(true);
  });
});
