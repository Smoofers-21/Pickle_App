import { describe, expect, it } from "vitest";
import { isOpenNow, isValidTimeZone, parseOpeningHours } from "./opening-hours";

// Wed Nov 11, 2026 in Austin (America/Chicago, UTC−6).
const at = (local: string) => new Date(`${local}-06:00`);
const TZ = "America/Chicago";

describe("isOpenNow", () => {
  it("handles one range for every day", () => {
    expect(isOpenNow("Mo-Su 10:45-22:00", at("2026-11-11T12:00:00"), TZ)).toBe(true);
    expect(isOpenNow("Mo-Su 10:45-22:00", at("2026-11-11T22:30:00"), TZ)).toBe(false);
  });

  it("handles hours past midnight, read from the day before", () => {
    const hours = "Su-We 11:00-24:00, Th 11:00-01:00, Fr,Sa 11:00-04:00";
    // Sat Nov 14, 2:00 am: Friday's hours run to 4:00.
    expect(isOpenNow(hours, at("2026-11-14T02:00:00"), TZ)).toBe(true);
    // Thu Nov 12, 0:30 am: Wednesday closed at midnight.
    expect(isOpenNow(hours, at("2026-11-12T00:30:00"), TZ)).toBe(false);
    // Fri Nov 13, 0:30 am: Thursday runs to 1:00.
    expect(isOpenNow(hours, at("2026-11-13T00:30:00"), TZ)).toBe(true);
  });

  it("lets a later rule override days, and understands off", () => {
    const hours = "Mo-Fr 08:00-17:00; We off; Sa 10:00-14:00";
    expect(isOpenNow(hours, at("2026-11-11T09:00:00"), TZ)).toBe(false); // Wednesday off
    expect(isOpenNow(hours, at("2026-11-12T09:00:00"), TZ)).toBe(true); // Thursday
    expect(isOpenNow(hours, at("2026-11-15T12:00:00"), TZ)).toBe(false); // Sunday not listed
  });

  it("understands 24/7 and treats holiday exceptions as unknown", () => {
    expect(isOpenNow("24/7", at("2026-11-11T03:00:00"), TZ)).toBe(true);
    expect(isOpenNow("Mo-Su 11:00-21:00; PH off", at("2026-11-11T12:00:00"), TZ)).toBeNull();
  });

  it("returns null (unknown) for anything it can't read", () => {
    expect(isOpenNow("Nov-Mar Mo-Fr 10:00-16:00", at("2026-11-11T12:00:00"), TZ)).toBeNull();
    expect(isOpenNow("Mo-Fr 10:00+", at("2026-11-11T12:00:00"), TZ)).toBeNull();
    expect(isOpenNow("sunrise-sunset", at("2026-11-11T12:00:00"), TZ)).toBeNull();
    expect(isOpenNow(undefined, at("2026-11-11T12:00:00"), TZ)).toBeNull();
    expect(isOpenNow("Mo-Su 10:00-22:00", at("2026-11-11T12:00:00"), null)).toBeNull();
    expect(isOpenNow("Mo-Su 10:00-22:00", at("2026-11-11T12:00:00"), "Not/AZone")).toBeNull();
  });

  it("reads the day in the place's time zone, not the server's", () => {
    // 05:00 UTC Thursday is still Wednesday 23:00 in Austin.
    expect(isOpenNow("We 22:00-24:00", new Date("2026-11-12T05:00:00Z"), TZ)).toBe(true);
  });
});

describe("parseOpeningHours", () => {
  it.each(["Mo 10:99-18:00", "Mo 24:30-26:00", "Mo 10:00-25:99"])("treats invalid clock components as unknown: %s", (hours) => {
    expect(parseOpeningHours(hours)).toBeNull();
  });
  it("wraps day ranges across the week", () => {
    const week = parseOpeningHours("Fr-Mo 18:00-23:00")!;
    expect(week.map((d) => d.length)).toEqual([1, 0, 0, 0, 1, 1, 1]);
  });
});

describe("isValidTimeZone", () => {
  it("accepts real zones only", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});
