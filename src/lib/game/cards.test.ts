import { describe, expect, it } from "vitest";
import { cardLink, kindChips, milesLabel, parseSeen, seenStorageKey, swipeDirection, timeLabel, voteGate } from "./cards";

describe("card labels", () => {
  it("formats miles", () => {
    expect(milesLabel(0.42)).toBe("0.4 mi");
    expect(milesLabel(12.6)).toBe("13 mi");
  });

  it("formats event start times in 12-hour time", () => {
    expect(timeLabel("20:00")).toBe("8:00 PM");
    expect(timeLabel("00:30")).toBe("12:30 AM");
    expect(timeLabel("12:05")).toBe("12:05 PM");
    expect(timeLabel("25:00")).toBeNull();
    expect(timeLabel(null)).toBeNull();
    expect(timeLabel("8pm")).toBeNull();
  });

  it("splits the kind into at most 3 pills", () => {
    expect(kindChips("Rock · Music")).toEqual(["Rock", "Music"]);
    expect(kindChips("Italian")).toEqual(["Italian"]);
    expect(kindChips("")).toEqual([]);
  });
});

describe("cardLink", () => {
  it("uses the ticket page for events", () => {
    expect(cardLink({ source: "ticketmaster", link: "https://t.example/e", name: "Gig", address: null })).toEqual({
      href: "https://t.example/e",
      label: "Tickets",
    });
    expect(cardLink({ source: "ticketmaster", link: null, name: "Gig", address: "1 Main St" })).toBeNull();
  });

  it("prefers the website, then a map search of the public address", () => {
    expect(cardLink({ source: "geoapify", link: "https://cafe.example", name: "Cafe", address: "1 Main St" })?.label).toBe("Website");
    const map = cardLink({ source: "geoapify", link: null, name: "Joe's & Co", address: "1 Main St, Austin" });
    expect(map?.label).toBe("Map");
    expect(map?.href).toBe("https://www.google.com/maps/search/?api=1&query=Joe's%20%26%20Co%2C%201%20Main%20St%2C%20Austin");
    expect(cardLink({ source: "geoapify", link: null, name: "Cafe", address: null })).toBeNull();
  });
});

describe("Go vote gate", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  it("stays locked until every card is seen", () => {
    expect(voteGate(new Set(["a", "b", "c"]), ids)).toEqual({ unlocked: false, label: "Go vote · 3 of 6 seen", share: 0.5 });
    expect(voteGate(new Set(ids), ids)).toEqual({ unlocked: true, label: "Go vote", share: 1 });
  });

  it("ignores IDs from other rounds and never unlocks an empty round", () => {
    expect(voteGate(new Set(["a", "x", "y"]), ["a", "b"]).unlocked).toBe(false);
    expect(voteGate(new Set(), [])).toEqual({ unlocked: false, label: "Go vote · 0 of 0 seen", share: 0 });
  });
});

describe("remembered seen cards", () => {
  it("keys by game and round", () => {
    expect(seenStorageKey("g1", 2)).toBe("pickle:seen:g1:2");
  });

  it("always counts the first card and keeps only this round's IDs", () => {
    expect([...parseSeen(null, ["a", "b"])]).toEqual(["a"]);
    expect([...parseSeen('["b","z",3,null]', ["a", "b", "c"])].sort()).toEqual(["a", "b"]);
    expect([...parseSeen("not json", ["a"])]).toEqual(["a"]);
    expect([...parseSeen('{"a":1}', ["a"])]).toEqual(["a"]);
    expect([...parseSeen(null, [])]).toEqual([]);
  });
});

describe("swipeDirection", () => {
  it("moves on a clear horizontal swipe", () => {
    expect(swipeDirection(-80, 10)).toBe(1);
    expect(swipeDirection(90, -5)).toBe(-1);
  });

  it("ignores short or mostly vertical moves (scrolling)", () => {
    expect(swipeDirection(-30, 0)).toBe(0);
    expect(swipeDirection(-70, 120)).toBe(0);
  });
});
