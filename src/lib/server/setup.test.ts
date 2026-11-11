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
