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

/** The "Go vote" button: unlocked once every card has been seen. */
export function voteGate(seen: ReadonlySet<number>, total: number): { unlocked: boolean; label: string } {
  const count = Math.min([...seen].filter((i) => i >= 0 && i < total).length, total);
  const unlocked = total > 0 && count === total;
  return { unlocked, label: unlocked ? "Go vote" : `Go vote · ${count} of ${total} seen` };
}

/** Where this phone remembers which cards it has seen, per game and round. */
export function seenStorageKey(gameId: string, round: number): string {
  return `pickle:seen:${gameId}:${round}`;
}

/** Reads a saved list of seen card indexes, ignoring anything malformed. */
export function parseSeen(raw: string | null, total: number): Set<number> {
  const seen = new Set<number>([0]);
  if (!raw) return seen;
  try {
    const list: unknown = JSON.parse(raw);
    if (Array.isArray(list)) {
      for (const i of list) if (Number.isInteger(i) && i >= 0 && i < total) seen.add(i);
    }
  } catch {
    // A corrupt value just means starting over at the first card.
  }
  return seen;
}
