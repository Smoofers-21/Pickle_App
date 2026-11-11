// Turns a Ticketmaster Discovery API v2 event search into Candidates. Pure
// code, tested on a sample in the documented response shape
// (developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/).
// Primary = segment and genre ("Music", "Rock"), secondary = subgenre.

import type { Candidate } from "@/lib/game/scoring";
import { isCalendarDate } from "@/lib/game/setup";
import { cleanText, finiteNumber, safeLink } from "./provider";

type Classification = {
  primary?: boolean;
  segment?: { name?: unknown };
  genre?: { name?: unknown };
  subGenre?: { name?: unknown };
};
type Image = { url?: unknown; width?: unknown; ratio?: unknown };
type Venue = {
  name?: unknown;
  address?: { line1?: unknown };
  city?: { name?: unknown };
  state?: { stateCode?: unknown };
  location?: { latitude?: unknown; longitude?: unknown };
};
type Event = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  distance?: unknown;
  info?: unknown;
  dates?: { start?: { localDate?: unknown; localTime?: unknown } };
  classifications?: Classification[];
  images?: Image[];
  ageRestrictions?: { legalAgeEnforced?: unknown };
  _embedded?: { venues?: Venue[] };
};

/** Ticketmaster uses "Undefined" and "Other" when it has no genre. */
function genreName(value: unknown): string | null {
  const text = cleanText(value, 40);
  return text && !/^(undefined|other|miscellaneous)$/i.test(text) ? text : null;
}

/** A Ticketmaster image URL (https, on Ticketmaster's image hosts), preferring 16:9 around 640 px wide. */
export function pickImage(images: Image[] | undefined): string | null {
  if (!Array.isArray(images)) return null;
  const usable = images
    .map((img) => ({ url: safeLink(img?.url), width: Number(img?.width) || 0, ratio: img?.ratio }))
    .filter((img): img is { url: string; width: number; ratio: unknown } => {
      if (!img.url) return false;
      const host = new URL(img.url).hostname;
      return img.url.startsWith("https://") && (host === "ticketm.net" || host.endsWith(".ticketm.net"));
    });
  usable.sort((a, b) => {
    const ra = a.ratio === "16_9" ? 0 : 1;
    const rb = b.ratio === "16_9" ? 0 : 1;
    return ra - rb || Math.abs(a.width - 640) - Math.abs(b.width - 640);
  });
  return usable[0]?.url ?? null;
}

export function ticketmasterCandidate(event: unknown): Candidate | null {
  const e = event as Event | null;
  if (!e || typeof e !== "object") return null;
  const id = typeof e.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(e.id) ? e.id : null;
  const name = cleanText(e.name, 100);
  const date = isCalendarDate(e.dates?.start?.localDate)
    ? e.dates.start.localDate
    : null;
  const distance = finiteNumber(e.distance);
  if (!id || !name || !date || distance === null || distance < 0) return null;

  const classifications = Array.isArray(e.classifications) ? e.classifications : [];
  const cls = classifications.find((c) => c?.primary) ?? classifications[0];
  const segment = genreName(cls?.segment?.name);
  const genre = genreName(cls?.genre?.name);
  const subGenre = genreName(cls?.subGenre?.name);
  const venue = e._embedded?.venues?.[0];
  const time = typeof e.dates?.start?.localTime === "string" && /^\d{2}:\d{2}/.test(e.dates.start.localTime)
    ? e.dates.start.localTime.slice(0, 5)
    : null;
  const address = [cleanText(venue?.address?.line1, 80), cleanText(venue?.city?.name, 40), cleanText(venue?.state?.stateCode, 10)]
    .filter(Boolean)
    .join(", ");
  const lat = finiteNumber(venue?.location?.latitude);
  const lng = finiteNumber(venue?.location?.longitude);

  return {
    source: "ticketmaster",
    sourceId: id,
    name,
    primary: [segment, genre].filter((x): x is string => Boolean(x)),
    secondary: subGenre && subGenre !== genre ? [subGenre] : [],
    text: [cleanText(venue?.name, 80), cleanText(e.info, 200)].filter(Boolean).join(" ") || undefined,
    distanceMi: Math.round(distance * 100) / 100,
    indoorOutdoor: null,
    adultsOnly: e.ageRestrictions?.legalAgeEnforced === true ? true : null,
    eventDate: date,
    card: {
      kind: [genre, segment].filter(Boolean).join(" · ") || "Event",
      address: address || null,
      link: safeLink(e.url),
      imageUrl: pickImage(e.images),
      venue: cleanText(venue?.name, 80),
      startTime: time,
      lat: lat !== null && Math.abs(lat) <= 90 ? lat : null,
      lng: lng !== null && Math.abs(lng) <= 180 ? lng : null,
    },
  };
}

export function parseTicketmaster(body: unknown): { candidates: Candidate[]; total: number } {
  const b = body as { _embedded?: { events?: unknown[] }; page?: { totalElements?: unknown } } | null;
  if (!b || typeof b !== "object" || Array.isArray(b) || !("page" in b) || !b.page ||
      !Number.isInteger(finiteNumber(b.page.totalElements)) || Number(b.page.totalElements) < 0 ||
      (b._embedded !== undefined && !Array.isArray(b._embedded?.events))) throw new Error("Unexpected events response");
  const events = Array.isArray(b._embedded?.events) ? b._embedded.events : []; // no _embedded = no events
  const candidates: Candidate[] = [];
  for (const e of events) {
    const c = ticketmasterCandidate(e);
    if (c) candidates.push(c);
  }
  return { candidates, total: Number(b.page?.totalElements) || candidates.length };
}

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Geohash of a point (Ticketmaster's geoPoint filter). */
export function geohash(lat: number, lng: number, precision = 9): string {
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    const range = even ? lngRange : latRange;
    const value = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (value >= mid) {
      ch = (ch << 1) | 1;
      if (even) lngRange = [mid, range[1]];
      else latRange = [mid, range[1]];
    } else {
      ch <<= 1;
      if (even) lngRange = [range[0], mid];
      else latRange = [range[0], mid];
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}
