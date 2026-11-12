// What an option card (screen 12) shows, as plain code so it can be tested.
// See "Cards (view only)" in docs/product-spec.md.

import type { OptionView } from "@/lib/lobby-types";

/** "0.4 mi" under 10 miles, "12 mi" above. */
export function milesLabel(mi: number): string {
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

/** "20:00" → "8:00 PM". Returns null for anything that isn't HH:MM. */
export function timeLabel(hhmm: string | null): string | null {
  const m = hhmm ? /^(\d{2}):(\d{2})$/.exec(hhmm) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** The pills under the name: "Rock · Music" → ["Rock", "Music"]. */
export function kindChips(kind: string): string[] {
  return kind
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export type CardLink = { href: string; label: string };

/**
 * The card's one link: the event's ticket page, the place's website, or a
 * map search for the place's name and address. Map links use only the
 * place's public address, never anyone's location.
 */
export function cardLink(o: Pick<OptionView, "source" | "link" | "name" | "address">): CardLink | null {
  if (o.source === "ticketmaster") return o.link ? { href: o.link, label: "Tickets" } : null;
  if (o.link) return { href: o.link, label: "Website" };
  if (!o.address) return null;
  const query = encodeURIComponent(`${o.name}, ${o.address}`);
  return { href: `https://www.google.com/maps/search/?api=1&query=${query}`, label: "Map" };
}

/** The "Go vote" button: unlocked once every card in this round has been seen. */
export function voteGate(seen: ReadonlySet<string>, ids: readonly string[]): { unlocked: boolean; label: string; share: number } {
  const total = ids.length;
  const count = ids.filter((id) => seen.has(id)).length;
  const unlocked = total > 0 && count === total;
  return {
    unlocked,
    label: unlocked ? "Go vote" : `Go vote · ${count} of ${total} seen`,
    /** How much of the round has been seen, 0 to 1: how green the button is. */
    share: total > 0 ? count / total : 0,
  };
}

/** Prefix of every saved "seen cards" entry; only the current round's is kept. */
export const SEEN_PREFIX = "pickle:seen:";

/** Where this phone remembers which cards it has seen, per game and round. */
export function seenStorageKey(gameId: string, round: number): string {
  return `${SEEN_PREFIX}${gameId}:${round}`;
}

/**
 * Reads a saved list of seen option IDs, keeping only IDs in this round (so a
 * changed set of options can never count as seen) and always counting the
 * first card. Anything malformed is ignored.
 */
export function parseSeen(raw: string | null, ids: readonly string[]): Set<string> {
  const seen = new Set<string>(ids.slice(0, 1));
  if (!raw) return seen;
  try {
    const list: unknown = JSON.parse(raw);
    if (Array.isArray(list)) {
      const valid = new Set(ids);
      for (const id of list) if (typeof id === "string" && valid.has(id)) seen.add(id);
    }
  } catch {
    // A corrupt value just means starting over at the first card.
  }
  return seen;
}

/** A horizontal swipe far enough to change card: -1 back, 1 forward, 0 none. */
export function swipeDirection(dx: number, dy: number, minPx = 50): -1 | 0 | 1 {
  // Mostly-vertical moves are scrolling, not swiping.
  if (Math.abs(dx) < minPx || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
