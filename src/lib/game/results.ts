// Plain helpers for the results screen (16), tested in results.test.ts.
// Links use only the place's public name and address (or the event's
// venue), never anyone's location.

import type { OptionView } from "@/lib/lobby-types";

type Linkable = Pick<OptionView, "name" | "address" | "venue">;

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isAppleMobile(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** Where to go: "Name, address", or "Name, venue" for an event with no address. */
function destination(o: Linkable): string | null {
  const where = o.address ?? o.venue;
  return where ? `${o.name}, ${where}` : null;
}

/**
 * Directions to an option: Apple Maps on iPhone and iPad, Google Maps
 * elsewhere. Null when there's no address or venue to go to.
 */
export function directionsUrl(o: Linkable, apple: boolean): string | null {
  const to = destination(o);
  if (!to) return null;
  const q = encodeURIComponent(to);
  return apple ? `https://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

/** A web search for the place or event. */
export function webSearchUrl(o: Linkable): string {
  return `https://www.google.com/search?q=${encodeURIComponent(destination(o) ?? o.name)}`;
}

/**
 * Splits the results into the winners (every option in 1st place, so a tie
 * shows both) and the rest of the top 3, in order.
 */
export function resultsLayout(options: readonly OptionView[]): { winners: OptionView[]; others: OptionView[]; tied: boolean } {
  const top = options.filter((o) => o.place !== undefined && o.place <= 3);
  const winners = top.filter((o) => o.place === 1);
  const others = top.filter((o) => o.place !== 1);
  const places = top.map((o) => o.place);
  return { winners, others, tied: new Set(places).size < places.length };
}
