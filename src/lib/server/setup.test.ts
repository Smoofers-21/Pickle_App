import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readSetup } from "./setup";

afterEach(() => vi.useRealTimers());
const setup = { category: "events", eventDate: "2026-02-28", radiusMi: 5, age: "all", indoorOutdoor: "either", rounds: 1, lat: 30, lng: -97 };
describe("server setup dates", () => {
  it("rejects impossible dates even when Date.parse rolls them into the allowed window", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-02-25T12:00:00Z"));
    expect(readSetup({ ...setup, eventDate: "2026-02-30" }).ok).toBe(false);
    expect(readSetup(setup).ok).toBe(true);
  });
});

describe("readSetup in a demo lobby", () => {
  const base = { category: "food", radiusMi: 5, age: "all", indoorOutdoor: "either", rounds: 1 };

  it("centers on the chosen demo area, never the phone's location", () => {
    const res = readSetup({ ...base, demoArea: "los_angeles", lat: 40.7, lng: -74, timeZone: "America/New_York" }, { demo: true });
    expect(res.ok && [res.params.p_lat, res.params.p_lng, res.params.p_time_zone]).toEqual([34.048, -118.253, "America/Los_Angeles"]);
  });

  it("needs one of the demo areas", () => {
    expect(readSetup({ ...base, lat: 36, lng: -94 }, { demo: true }).ok).toBe(false);
    expect(readSetup({ ...base, demoArea: "paris" }, { demo: true }).ok).toBe(false);
  });

  it("ignores a demo area outside demo lobbies", () => {
    const res = readSetup({ ...base, demoArea: "los_angeles", lat: 40.7, lng: -74 });
    expect(res.ok && [res.params.p_lat, res.params.p_lng]).toEqual([40.7, -74]);
  });
});
