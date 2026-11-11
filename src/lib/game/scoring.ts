// Search and scoring rules (see "Search and scoring" in docs/build-plan.md).
// Plain functions with no API calls, so they can be tested on sample data.
// Milestone 4 feeds them real results from the places provider (Geoapify,
// OpenStreetMap data) and Ticketmaster.

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
  /** Where it came from. Places providers are swappable (see PlacesProvider in milestone 4). */
  source: "geoapify" | "ticketmaster";
  sourceId: string;
  name: string;
  /** Places: main OSM cuisine(s) or bar type. Events: Ticketmaster segment + genre. */
  primary: string[];
  /** Places: other categories (extra cuisines, diet tags, Geoapify categories). Events: the subgenre. */
  secondary: string[];
  /** Extra text to match keywords against (description, venue name). */
  text?: string;
  distanceMi: number;
  indoorOutdoor?: "indoor" | "outdoor" | null;
  /** True when only 21+ may attend. Null when unknown. */
  adultsOnly?: boolean | null;
  /** Food and bars: open right now per OpenStreetMap hours. Null when unknown (kept). */
  openNow?: boolean | null;
  /** Events: local date, YYYY-MM-DD. */
  eventDate?: string | null;
  /** What the option card shows (milestone 5). Never used for scoring. */
  card?: OptionCard;
};

/** Display details saved with each option for its card. */
export type OptionCard = {
  /** "Italian", "Bar", "Rock · Music"… */
  kind: string;
  address?: string | null;
  /** The place's own website or the event's ticket page (http/https only). */
  link?: string | null;
  /** Events: the Ticketmaster image URL. Places use a local cuisine image instead. */
  imageUrl?: string | null;
  /** Places: the OSM categories used to pick the local cuisine image. */
  imageKeys?: string[];
  /** Places: raw OSM opening_hours, so "open now" can be checked again later. */
  hours?: string | null;
  /** Events: venue name and local start time (HH:MM). */
  venue?: string | null;
  startTime?: string | null;
  lat?: number | null;
  lng?: number | null;
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
 * Step 3, filter: places not listed as closed now, events on the chosen date, 21+ venues
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
    if (alreadyShown.has(`name:${normalizeName(c.name)}`)) return false;
    if (!Number.isFinite(c.distanceMi) || c.distanceMi < 0) return false;
    if (c.distanceMi > radiusMi) return false;
    if (settings.age === "all" && c.adultsOnly === true) return false;
    if (settings.category === "events") {
      if (settings.eventDate && c.eventDate !== settings.eventDate) return false;
    } else if (c.openNow === false) {
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

/**
 * Starting adjustments from the build plan (to be tuned with real searches).
 * No ratings: the places data (OpenStreetMap) has none, so distance is worth
 * up to 20 points instead.
 */
export const WEIGHTS = {
  start: 50,
  yesPrimary: 15,
  yesSecondary: 8,
  noPrimary: -40,
  noSecondary: -10,
  indoorOutdoor: 5,
  distanceMax: 20,
};

export type Match = "primary" | "secondary" | null;

const lower = (list: string[]) => list.map((s) => s.toLowerCase());

/** How central a pool entry is to a candidate. */
export function matchStrength(entry: PoolEntry, c: Candidate): Match {
  return matchPrepared(entry, prepareCandidate(c));
}

function prepareCandidate(c: Candidate) {
  return {
    primary: lower(c.primary),
    secondary: lower(c.secondary),
    text: normalizeText(`${c.name} ${c.text ?? ""} ${[...c.primary, ...c.secondary].join(" ").replace(/_/g, " ")}`),
  };
}

function matchPrepared(entry: PoolEntry, { primary, secondary, text }: ReturnType<typeof prepareCandidate>): Match {
  if (entry.tag) {
    const cats = lower(entry.tag.categories);
    if (cats.some((cat) => primary.includes(cat))) return "primary";
    if (cats.some((cat) => secondary.includes(cat))) return "secondary";
    // A tag word in the name or description also counts, as secondary: much
    // OpenStreetMap data has no cuisine ("Little Italy Pizza").
    const words = [...entry.tag.categories, ...(entry.tag.keywords ?? [])];
    if (words.some((k) => containsWord(text, normalizeText(k)))) return "secondary";
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

/** Distance points: full at 0 mi, none at the edge of the radius. */
export function distancePoints(distanceMi: number, radiusMi: number): number {
  if (radiusMi <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distanceMi / radiusMi)) * WEIGHTS.distanceMax;
}

/** Step 5, score: start at 50, apply each adjustment, keep within 0–100. */
export function score(c: Candidate, pool: Pool, settings: GameSettings, radiusMi: number): number {
  let s = WEIGHTS.start;
  const prepared = prepareCandidate(c);
  for (const entry of pool.yes) {
    const m = matchPrepared(entry, prepared);
    if (m === "primary") s += WEIGHTS.yesPrimary * entry.count;
    else if (m === "secondary") s += WEIGHTS.yesSecondary * entry.count;
  }
  for (const entry of pool.no) {
    const m = matchPrepared(entry, prepared);
    if (m === "primary") s += WEIGHTS.noPrimary * entry.count;
    else if (m === "secondary") s += WEIGHTS.noSecondary * entry.count;
  }
  if (settings.indoorOutdoor !== "either" && c.indoorOutdoor === settings.indoorOutdoor) {
    s += WEIGHTS.indoorOutdoor;
  }
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
