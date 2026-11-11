// The swappable places provider (see "Places data provider" in
// docs/build-plan.md). The game only ever sees Candidates, so changing
// provider means writing one new adapter.

import type { Candidate } from "@/lib/game/scoring";

export type SearchArea = {
  lat: number;
  lng: number;
  radiusMi: number;
  /** Skip this many of the nearest results (to fetch the next page when widening). */
  offset?: number;
};

export type PlacesCategory = "food" | "bars";

export type SearchContext = {
  /** IANA time zone of the search area, used for "open now". */
  timeZone: string | null;
  now: Date;
};

export type PlacesPage = {
  candidates: Candidate[];
  /** True when the page was full, so more results exist beyond it. */
  more: boolean;
};

export interface PlacesProvider {
  readonly name: Candidate["source"];
  /** The most results one search returns. */
  readonly pageSize: number;
  /** Free-plan credits one search costs (checked against the daily budget first). */
  creditsPerSearch(): number;
  search(area: SearchArea, category: PlacesCategory, context: SearchContext): Promise<PlacesPage>;
}

export const METERS_PER_MILE = 1609.344;

/** Great-circle distance in miles. */
export function distanceMi(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Keeps only http(s) links, so a card can never open a javascript: or other link. */
export function safeLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A short, plain-text string from untrusted provider data. */
export function cleanText(value: unknown, max = 120): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}
