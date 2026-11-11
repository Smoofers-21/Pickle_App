import "server-only";
import type { Candidate } from "@/lib/game/scoring";
import { GEOAPIFY_CATEGORIES, parseGeoapify } from "@/lib/places/geoapify-parse";
import {
  METERS_PER_MILE,
  type PlacesCategory,
  type PlacesPage,
  type PlacesProvider,
  type SearchArea,
  type SearchContext,
} from "@/lib/places/provider";
import { geohash, parseTicketmaster } from "@/lib/places/ticketmaster-parse";
import { serverSecret } from "@/lib/server-env";

// The only code that calls outside APIs. Rules (docs/build-plan.md, "API cost"
// and "Security and privacy"):
//   - fixed HTTPS hosts, a time limit, and a size limit on every response;
//   - no retries (a retry would spend credits twice);
//   - keys come from server-env only; errors carry a short code, never the
//     request URL (Ticketmaster's key is in its query string), the provider's
//     error body, or the search location.

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 3_000_000;

export class ProviderError extends Error {
  constructor(readonly code: "timeout" | "http" | "too_large" | "bad_response" | "network", readonly status?: number) {
    super(`provider_${code}${status ? `_${status}` : ""}`);
    this.name = "ProviderError";
  }
}

async function getJson(url: URL, headers: Record<string, string> = {}): Promise<unknown> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal,
      cache: "no-store",
      redirect: "error",
    });
  } catch (err) {
    throw new ProviderError(signal.aborted || (err as Error)?.name === "TimeoutError" ? "timeout" : "network");
  }
  if (!res.ok) {
    void res.body?.cancel().catch(() => {});
    throw new ProviderError("http", res.status);
  }
  const length = Number(res.headers.get("content-length"));
  if (length > MAX_BYTES) {
    void res.body?.cancel().catch(() => {});
    throw new ProviderError("too_large");
  }
  if (!res.body) throw new ProviderError("bad_response");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  let abort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(new ProviderError("timeout"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    while (true) {
      if (signal.aborted) throw new ProviderError("timeout");
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) { text += decoder.decode(); break; }
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new ProviderError("too_large");
      text += decoder.decode(value, { stream: true });
    }
  } catch (err) {
    void reader.cancel().catch(() => {});
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(signal.aborted ? "timeout" : "network");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError("bad_response");
  }
}

/** Geoapify Places: restaurants and bars from OpenStreetMap data. */
export const geoapify: PlacesProvider = {
  name: "geoapify",
  // 100 results cost 5 credits (every 20 places is 1 credit, per Geoapify's
  // Places API pricing, checked Nov 11, 2026).
  pageSize: 100,
  creditsPerSearch() {
    return Math.ceil(this.pageSize / 20);
  },
  async search(area: SearchArea, category: PlacesCategory, context: SearchContext): Promise<PlacesPage> {
    const url = new URL("https://api.geoapify.com/v2/places");
    const lngLat = `${area.lng},${area.lat}`;
    url.searchParams.set("categories", GEOAPIFY_CATEGORIES[category].join(","));
    url.searchParams.set("filter", `circle:${lngLat},${Math.round(area.radiusMi * METERS_PER_MILE)}`);
    url.searchParams.set("bias", `proximity:${lngLat}`);
    url.searchParams.set("limit", String(this.pageSize));
    if (area.offset) url.searchParams.set("offset", String(area.offset));
    url.searchParams.set("lang", "en");
    // The key goes in a header, so it is never part of a URL.
    const body = await getJson(url, { "x-api-key": serverSecret("GEOAPIFY_API_KEY") });
    let candidates: Candidate[];
    try {
      candidates = parseGeoapify(body, category, area, context);
    } catch {
      throw new ProviderError("bad_response");
    }
    const count = Array.isArray((body as { features?: unknown[] }).features) ? (body as { features: unknown[] }).features.length : 0;
    return { candidates, more: count >= this.pageSize, consumed: count };
  },
};

export const TICKETMASTER_PAGE_SIZE = 100;

/** Ticketmaster events on one local date. One call per search (free key: 5,000 calls a day). */
export async function searchEvents(area: SearchArea, date: string): Promise<PlacesPage> {
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("geoPoint", geohash(area.lat, area.lng, 9));
  url.searchParams.set("radius", String(Math.ceil(area.radiusMi)));
  url.searchParams.set("unit", "miles");
  url.searchParams.set("localStartDateTime", `${date}T00:00:00,${date}T23:59:59`);
  url.searchParams.set("size", String(TICKETMASTER_PAGE_SIZE));
  url.searchParams.set("page", String(Math.floor((area.offset ?? 0) / TICKETMASTER_PAGE_SIZE)));
  url.searchParams.set("sort", "distance,asc");
  // Ticketmaster only accepts the key in the query string: this URL is never logged.
  url.searchParams.set("apikey", serverSecret("TICKETMASTER_API_KEY"));
  const body = await getJson(url);
  try {
    const { candidates } = parseTicketmaster(body);
    const page = (body as { page?: { totalPages?: unknown; number?: unknown } }).page;
    const more = Number(page?.number ?? 0) + 1 < Number(page?.totalPages ?? 0);
    const consumed = Array.isArray((body as { _embedded?: { events?: unknown[] } })._embedded?.events)
      ? (body as { _embedded: { events: unknown[] } })._embedded.events.length : 0;
    return { candidates, more, consumed };
  } catch {
    throw new ProviderError("bad_response");
  }
}
