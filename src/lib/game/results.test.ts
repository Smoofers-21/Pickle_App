import { describe, expect, it } from "vitest";
import type { OptionView } from "@/lib/lobby-types";
import { directionsUrl, isAppleMobile, resultsLayout, webSearchUrl } from "./results";

const place = { name: "Bella Pasta", address: "12 Main St, Springfield", venue: null };
const event = { name: "Jazz Night", address: null, venue: "Blue Room" };

describe("isAppleMobile", () => {
  it("spots iPhone and iPad, including iPadOS desktop mode", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
  });

  it("uses Google Maps on Android and desktop Macs", () => {
    expect(isAppleMobile("Mozilla/5.0 (Linux; Android 15; Pixel 9)", 5)).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
  });
});

describe("directionsUrl", () => {
  it("opens Apple Maps or Google Maps with the name and address", () => {
    expect(directionsUrl(place, true)).toBe("https://maps.apple.com/?daddr=Bella%20Pasta%2C%2012%20Main%20St%2C%20Springfield");
    expect(directionsUrl(place, false)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Bella%20Pasta%2C%2012%20Main%20St%2C%20Springfield",
    );
  });

  it("uses an event's venue, and gives up with nowhere to go", () => {
    expect(directionsUrl(event, false)).toContain("Jazz%20Night%2C%20Blue%20Room");
    expect(directionsUrl({ name: "Somewhere", address: null, venue: null }, true)).toBeNull();
  });

  it("escapes everything", () => {
    expect(directionsUrl({ name: "A&B #1", address: "1 St?x=y", venue: null }, false)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=A%26B%20%231%2C%201%20St%3Fx%3Dy",
    );
  });
});

describe("webSearchUrl", () => {
  it("searches for the place or event", () => {
    expect(webSearchUrl(place)).toBe("https://www.google.com/search?q=Bella%20Pasta%2C%2012%20Main%20St%2C%20Springfield");
    expect(webSearchUrl({ name: "Solo", address: null, venue: null })).toBe("https://www.google.com/search?q=Solo");
  });
});

describe("resultsLayout", () => {
  const opt = (id: string, place?: number) => ({ id, name: id, place }) as OptionView;

  it("puts 1st up top and the rest of the top 3 below", () => {
    const r = resultsLayout([opt("a", 1), opt("b", 2), opt("c", 3), opt("d", 4)]);
    expect(r.winners.map((o) => o.id)).toEqual(["a"]);
    expect(r.others.map((o) => o.id)).toEqual(["b", "c"]);
    expect(r.tied).toBe(false);
  });

  it("shows every winner of a tie, then 3rd", () => {
    const r = resultsLayout([opt("a", 1), opt("b", 1), opt("c", 3), opt("d", 4)]);
    expect(r.winners.map((o) => o.id)).toEqual(["a", "b"]);
    expect(r.others.map((o) => o.id)).toEqual(["c"]);
    expect(r.tied).toBe(true);
  });

  it("keeps a shared 3rd place", () => {
    const r = resultsLayout([opt("a", 1), opt("b", 2), opt("c", 3), opt("d", 3)]);
    expect(r.others.map((o) => o.id)).toEqual(["b", "c", "d"]);
    expect(r.tied).toBe(true);
  });
});
