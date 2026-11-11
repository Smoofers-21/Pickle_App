import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsEvent } from "./analytics";

describe("analytics privacy boundary", () => {
  it.each(["/", "/new", "/join"])("strips query strings and fragments from %s", (path) => {
    expect(sanitizeAnalyticsEvent({
      type: "pageview",
      url: `https://pickle.example${path}?name=Private&lat=30&token=secret#invite`,
    })).toEqual({ type: "pageview", url: `https://pickle.example${path}` });
  });

  it.each([
    ["/lobby/ABC123", "/lobby/[code]"],
    ["/join/ABC123/", "/join/[code]"],
    ["/lobby/%41BC123", "/lobby/[code]"],
  ])("redacts codes from %s", (path, expected) => {
    expect(sanitizeAnalyticsEvent({
      type: "pageview", url: `https://pickle.example${path}?name=Private#secret`,
    })).toEqual({ type: "pageview", url: `https://pickle.example${expected}` });
  });

  it.each(["/kit", "/unknown/private", "/api/lobbies/ABC123/state", "/lobby/ABC123/secret"])(
    "drops unreviewed routes such as %s", (path) => {
      expect(sanitizeAnalyticsEvent({ type: "pageview", url: `https://pickle.example${path}` })).toBeNull();
    },
  );

  it.each(["invalid", "javascript:alert(1)", "file:///join"])("drops malformed or unsupported URLs: %s", (url) => {
    expect(sanitizeAnalyticsEvent({ type: "pageview", url })).toBeNull();
  });

  it("removes URL credentials", () => {
    expect(sanitizeAnalyticsEvent({ type: "pageview", url: "https://private:secret@pickle.example/join" }))
      .toEqual({ type: "pageview", url: "https://pickle.example/join" });
  });

  it("drops custom events until their data has been reviewed", () => {
    expect(sanitizeAnalyticsEvent({ type: "event", url: "https://pickle.example/" })).toBeNull();
  });
});
