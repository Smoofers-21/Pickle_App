import { describe, expect, it } from "vitest";
import { cardLink, kindChips, milesLabel, parseSeen, seenStorageKey, timeLabel, voteGate } from "./cards";

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
  it("stays locked until every card is seen", () => {
    expect(voteGate(new Set([0, 1, 2]), 6)).toEqual({ unlocked: false, label: "Go vote · 3 of 6 seen", share: 0.5 });
    expect(voteGate(new Set([0, 1, 2, 3, 4, 5]), 6)).toEqual({ unlocked: true, label: "Go vote", share: 1 });
  });

  it("ignores indexes outside the round and never unlocks an empty round", () => {
    expect(voteGate(new Set([0, 7, -1]), 2).unlocked).toBe(false);
    expect(voteGate(new Set(), 0)).toEqual({ unlocked: false, label: "Go vote · 0 of 0 seen", share: 0 });
  });
});

describe("remembered seen cards", () => {
  it("keys by game and round", () => {
    expect(seenStorageKey("g1", 2)).toBe("pickle:seen:g1:2");
  });

  it("always counts the first card and drops bad values", () => {
    expect([...parseSeen(null, 6)]).toEqual([0]);
    expect([...parseSeen("[1,3,9,-2,\"x\",2.5]", 6)].sort()).toEqual([0, 1, 3]);
    expect([...parseSeen("not json", 6)]).toEqual([0]);
    expect([...parseSeen("{\"a\":1}", 6)]).toEqual([0]);
  });
});
