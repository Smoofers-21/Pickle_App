// Search and scoring rules (see "Search and scoring" in docs/build-plan.md).
// Plain functions with no API calls, so they can be tested on sample data.
// Milestone 4 feeds them real Google Places and Ticketmaster results.

import { findTag, type Category, type TagDef } from "./tags";

// ---------------------------------------------------------------------------
// Picks
// ---------------------------------------------------------------------------

/** One Yes or No: a preset tag, or the free-text "+ Other". */
export type PickValue = { tag: string } | { other: string };
export type MemberPicks = { no: PickValue; yes?: PickValue | null };

/** A tag (or "other" text) in the combined pool, with how many members chose it. */
export type PoolEntry = { key: string; tag?: TagDef; other?: string; count: number };
export type Pool = { yes: PoolEntry[]; no: PoolEntry[]; cancelled: string[] };

export function pickKey(value: PickValue): string {
  return "tag" in value ? `tag:${value.tag}` : `other:${normalizeText(value.other)}`;
}

/**
 * Step 1, combine picks: collect every Yes and No, then drop any tag that is
 * both someone's Yes and someone else's No (the cancel-out rule). Neither
 * side counts.
 */
export function combinePicks(category: Category, picks: MemberPicks[]): Pool {
  const yes = new Map<string, PoolEntry>();
  const no = new Map<string, PoolEntry>();

  const add = (map: Map<string, PoolEntry>, value: PickValue) => {
    const key = pickKey(value);
    const entry = map.get(key);
    if (entry) {
      entry.count += 1;
      return;
    }
    if ("tag" in value) {
      const tag = findTag(category, value.tag);
      if (tag) map.set(key, { key, tag, count: 1 });
    } else {
      map.set(key, { key, other: value.other, count: 1 });
    }
  };

  for (const p of picks) {
    add(no, p.no);
    if (p.yes) add(yes, p.yes);
  }

  const cancelled = [...yes.keys()].filter((k) => no.has(k));
  for (const k of cancelled) {
    yes.delete(k);
    no.delete(k);
  }
  return { yes: [...yes.values()], no: [...no.values()], cancelled };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** A place or event, in the same shape whichever source it came from. */
export type Candidate = {
  source: "google" | "ticketmaster";
  sourceId: string;
  name: string;
  /** Google primary type, or Ticketmaster segment + genre. */
  primary: string[];
  /** Other Google types, or the Ticketmaster subgenre. */
  secondary: string[];
  /** Extra text to match keywords against (description, venue name). */
  text?: string;
  distanceMi: number;
  rating?: number | null;
  indoorOutdoor?: "indoor" | "outdoor" | null;
  /** True when only 21+ may attend. Null when unknown. */
  adultsOnly?: boolean | null;
  /** Food and bars: open at some point today. Null when unknown. */
  openToday?: boolean | null;
  /** Events: local date, YYYY-MM-DD. */
  eventDate?: string | null;
};

export type GameSettings = {
  category: Category;
  radiusMi: number;
  age: "all" | "21_plus";
  indoorOutdoor: "either" | "indoor" | "outdoor";
  /** Events only, YYYY-MM-DD. */
  eventDate?: string | null;
};

/** Lowercase, no accents or punctuation, and no location suffix ("Chipotle - Main St" → "chipotle"). */
export function normalizeName(name: string): string {
  const base = name
    .split(/\s+[-–—|@]\s+|\s+at\s+/i)[0]
    .replace(/\([^)]*\)/g, " ");
  return normalizeText(base);
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Step 3, filter: places open today, events on the chosen date, 21+ venues
 * only when the host allowed them, within the radius, and nothing already
 * shown earlier in this game.
 */
export function filterCandidates(
  candidates: Candidate[],
  settings: GameSettings,
  radiusMi: number,
  alreadyShown: Set<string> = new Set(),
): Candidate[] {
  return candidates.filter((c) => {
    if (alreadyShown.has(`${c.source}:${c.sourceId}`)) return false;
    if (c.distanceMi > radiusMi) return false;
    if (settings.age === "all" && c.adultsOnly === true) return false;
    if (settings.category === "events") {
      if (settings.eventDate && c.eventDate !== settings.eventDate) return false;
    } else if (c.openToday === false) {
      return false;
    }
    return true;
  });
}

/** Step 4, remove duplicates: one per normalized name, keeping the closest. */
export function dedupe(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = normalizeName(c.name);
    const current = best.get(key);
    if (!current || c.distanceMi < current.distanceMi) best.set(key, c);
  }
  return [...best.values()];
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/** Starting adjustments from the build plan (to be tuned with real searches). */
export const WEIGHTS = {
  start: 50,
  yesPrimary: 15,
  yesSecondary: 8,
  noPrimary: -40,
  noSecondary: -10,
  indoorOutdoor: 5,
  ratingMax: 10,
  distanceMax: 10,
};

/** Rating at or above this earns full points; at or below `ratingFloor`, none. */
const ratingFull = 4.5;
const ratingFloor = 3.0;

export type Match = "primary" | "secondary" | null;

const lower = (list: string[]) => list.map((s) => s.toLowerCase());

/** How central a pool entry is to a candidate. */
export function matchStrength(entry: PoolEntry, c: Candidate): Match {
  const primary = lower(c.primary);
  const secondary = lower(c.secondary);
  const text = normalizeText(`${c.name} ${c.text ?? ""} ${[...c.primary, ...c.secondary].join(" ").replace(/_/g, " ")}`);

  if (entry.tag) {
    const cats = lower(entry.tag.categories);
    if (cats.some((cat) => primary.includes(cat))) return "primary";
    if (cats.some((cat) => secondary.includes(cat))) return "secondary";
    if (entry.tag.keywords?.some((k) => containsWord(text, normalizeText(k)))) return "secondary";
    return null;
  }
  if (entry.other) {
    const words = normalizeText(entry.other);
    return words && containsWord(text, words) ? "secondary" : null;
  }
  return null;
}

function containsWord(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

/** Rating points: unknown ratings (most events) get half, so they aren't punished. */
export function ratingPoints(rating: number | null | undefined): number {
  if (rating == null) return WEIGHTS.ratingMax / 2;
  if (rating >= ratingFull) return WEIGHTS.ratingMax;
  if (rating <= ratingFloor) return 0;
  return (WEIGHTS.ratingMax * (rating - ratingFloor)) / (ratingFull - ratingFloor);
}

/** Distance points: full at 0 mi, none at the edge of the radius. */
export function distancePoints(distanceMi: number, radiusMi: number): number {
  if (radiusMi <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distanceMi / radiusMi)) * WEIGHTS.distanceMax;
}

/** Step 5, score: start at 50, apply each adjustment, keep within 0–100. */
export function score(c: Candidate, pool: Pool, settings: GameSettings, radiusMi: number): number {
  let s = WEIGHTS.start;
  for (const entry of pool.yes) {
    const m = matchStrength(entry, c);
    if (m === "primary") s += WEIGHTS.yesPrimary * entry.count;
    else if (m === "secondary") s += WEIGHTS.yesSecondary * entry.count;
  }
  for (const entry of pool.no) {
    const m = matchStrength(entry, c);
    if (m === "primary") s += WEIGHTS.noPrimary * entry.count;
    else if (m === "secondary") s += WEIGHTS.noSecondary * entry.count;
  }
  if (settings.indoorOutdoor !== "either" && c.indoorOutdoor === settings.indoorOutdoor) {
    s += WEIGHTS.indoorOutdoor;
  }
  s += ratingPoints(c.rating);
  s += distancePoints(c.distanceMi, radiusMi);
  return Math.round(Math.max(0, Math.min(100, s)));
}

// ---------------------------------------------------------------------------
// Pick the options for a round
// ---------------------------------------------------------------------------

export const MATCH_THRESHOLD = 60;
export const OPTIONS_PER_ROUND = 6;
export const WIDEN_BY_MI = 5;

export type Scored = Candidate & { score: number };

/**
 * Steps 3–6: filter, remove duplicates, score, and keep the best options at
 * or above the threshold (up to 6). `needsWidening` tells the search to widen
 * the radius by 5 mi once and try again (milestone 4).
 */
export function chooseOptions(
  candidates: Candidate[],
  pool: Pool,
  settings: GameSettings,
  opts: { radiusMi?: number; alreadyShown?: Set<string>; threshold?: number; max?: number } = {},
): { options: Scored[]; needsWidening: boolean } {
  const radiusMi = opts.radiusMi ?? settings.radiusMi;
  const threshold = opts.threshold ?? MATCH_THRESHOLD;
  const max = opts.max ?? OPTIONS_PER_ROUND;

  const scored = dedupe(filterCandidates(candidates, settings, radiusMi, opts.alreadyShown))
    .map((c) => ({ ...c, score: score(c, pool, settings, radiusMi) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score || a.distanceMi - b.distanceMi || a.name.localeCompare(b.name));

  const options = scored.slice(0, max);
  return { options, needsWidening: options.length < max };
}
