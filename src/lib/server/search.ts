import "server-only";
import {
  chooseOptions,
  combinePicks,
  normalizeName,
  WIDEN_BY_MI,
  type Candidate,
  type GameSettings,
  type MemberPicks,
  type PickValue,
  type Scored,
} from "@/lib/game/scoring";
import { isOpenNow } from "@/lib/places/opening-hours";
import type { PlacesPage, SearchArea } from "@/lib/places/provider";
import { errorLabel } from "./api";
import { demoSearch } from "./demo-search";
import { findPicks, type PickRow } from "./lobby";
import { geoapify, ProviderError, searchEvents } from "./providers";
import { db } from "./supabase";

// Runs a round's search ("Search and scoring" and "API cost" in
// docs/build-plan.md):
//   1. claim the search in the database, so only one server runs it;
//   2. use places already saved for this game first;
//   3. otherwise one provider search (reserving its credits first);
//   4. fewer than 6 good options: widen by 5 mi once (a second search at most);
//   5. save every result, mark the chosen 6 as shown, and move everyone on.
// The host's location is deleted by the database after the last search.

/** Our own daily caps, below the free plans (Geoapify 3,000 credits, Ticketmaster 5,000 calls). */
export const DAILY_CAP = { geoapify: 2_500, ticketmaster: 4_500 } as const;
const MAX_SEARCHES_PER_ROUND = 2;

type Claim = {
  status: "ok";
  claim_token: string;
  active_member_ids: string[];
  is_demo: boolean;
  round: number;
  rounds_total: number;
  category: GameSettings["category"];
  event_date: string | null;
  radius_mi: number;
  age: GameSettings["age"];
  indoor_outdoor: GameSettings["indoorOutdoor"];
  time_zone: string | null;
  lat: number;
  lng: number;
};

/** Public progress for screens 10 and 11 (never the location). */
export type SearchProgress = {
  radius_mi: number;
  matches?: number;
  widened_to?: number;
  reason?: "budget" | "error" | "no_location";
};

class BudgetError extends Error {
  constructor() {
    super("daily_budget");
    this.name = "BudgetError";
  }
}

class StaleSearchError extends Error {}

function pickValue(tag: string | null, other: string | null): PickValue | null {
  if (!tag) return null;
  return tag === "other" ? (other ? { other } : null) : { tag };
}

export function memberPicks(rows: PickRow[], activeMembers?: ReadonlySet<string>): MemberPicks[] {
  const out: MemberPicks[] = [];
  for (const r of rows) {
    if (activeMembers && !activeMembers.has(r.member_id)) continue;
    const no = r.ready ? pickValue(r.no_tag, r.no_other) : null;
    if (no) out.push({ no, yes: pickValue(r.yes_tag, r.yes_other) });
  }
  return out;
}

/** Saved options for this game: unshown ones as Candidates, plus the keys already shown. */
async function loadCache(gameId: string, timeZone: string | null) {
  const { data, error } = await db()
    .from("options")
    .select("source, source_id, shown_in_round, details")
    .eq("game_id", gameId);
  if (error) throw error;
  const now = new Date();
  const candidates: Candidate[] = [];
  const shown = new Set<string>();
  for (const row of data ?? []) {
    if (row.shown_in_round != null) {
      shown.add(`${row.source}:${row.source_id}`);
      const name = (row.details as Partial<Candidate> | null)?.name;
      if (typeof name === "string") shown.add(`name:${normalizeName(name)}`);
      continue;
    }
    const c = row.details as Candidate;
    if (!c || typeof c !== "object" || !c.name) continue;
    // "Open now" may have changed since the place was saved.
    candidates.push(c.source === "geoapify" ? { ...c, openNow: isOpenNow(c.card?.hours, now, timeZone) } : c);
  }
  return { candidates, shown };
}

async function saveOptions(gameId: string, candidates: Candidate[], token: string): Promise<Map<string, string>> {
  const rows = candidates.map((c) => ({
    source: c.source,
    source_id: c.sourceId,
    name: c.name,
    normalized_name: normalizeName(c.name),
    address: c.card?.address ?? null,
    tags: [...c.primary, ...c.secondary].slice(0, 30),
    distance_mi: c.distanceMi,
    link: c.card?.link ?? null,
    details: c,
  }));
  const { data, error } = await db().rpc("save_options", { p_game_id: gameId, p_options: rows, p_claim_token: token });
  if (error) throw error;
  const ids = new Map<string, string>();
  for (const r of (data ?? []) as { option_id: string; option_source: string; option_source_id: string }[]) {
    ids.set(`${r.option_source}:${r.option_source_id}`, r.option_id);
  }
  return ids;
}

/** One provider search, after reserving its cost in the shared daily budget. */
async function fetchPage(gameId: string, claim: Claim, area: SearchArea): Promise<PlacesPage> {
  if (claim.is_demo) return demoSearch(claim.category, claim.event_date);
  const provider = claim.category === "events" ? "ticketmaster" : "geoapify";
  const units = provider === "geoapify" ? geoapify.creditsPerSearch() : 1;
  const { data: reserved, error } = await db().rpc("reserve_search_units", {
    p_game_id: gameId,
    p_claim_token: claim.claim_token,
    p_provider: provider,
    p_units: units,
    p_daily_cap: DAILY_CAP[provider],
  });
  if (error) throw error;
  if (reserved === "stale") throw new StaleSearchError();
  if (reserved !== "ok") throw new BudgetError();
  if (claim.category === "events") {
    if (!claim.event_date) return { candidates: [], more: false, consumed: 0 };
    return searchEvents(area, claim.event_date);
  }
  return geoapify.search(area, claim.category, { timeZone: claim.time_zone, now: new Date() });
}

async function progress(gameId: string, search: SearchProgress, token: string) {
  const { data, error } = await db().rpc("search_progress", { p_game_id: gameId, p_search: search, p_claim_token: token });
  if (error) throw error;
  if (data !== true) throw new StaleSearchError();
}

async function finish(gameId: string, status: "done" | "nothing_found" | "unavailable", search: SearchProgress, token: string, chosen: { id: string; score: number }[] = []) {
  const { data, error } = await db().rpc("finish_search", {
    p_game_id: gameId,
    p_status: status,
    p_search: search,
    p_chosen: chosen,
    p_claim_token: token,
  });
  if (error) throw error;
  if (data?.status === "stale") throw new StaleSearchError();
  if (data?.status !== "ok") throw new Error("Search result rejected");
}

/**
 * Runs the current round's search if it hasn't run yet. Safe to call from
 * any request, any number of times: the database lets one server claim it.
 */
export async function runSearchIfNeeded(gameId: string): Promise<void> {
  // Runs after the response is sent: log a short label, never throw.
  await runSearch(gameId).catch((err) => console.error(`search: ${errorLabel(err)}`));
}

async function runSearch(gameId: string): Promise<void> {
  const { data, error } = await db().rpc("claim_search", { p_game_id: gameId });
  if (error) throw error;
  if (data?.status !== "ok") return;
  const claim = data as Claim;

  const settings: GameSettings = {
    category: claim.category,
    radiusMi: Number(claim.radius_mi),
    age: claim.age,
    indoorOutdoor: claim.indoor_outdoor,
    eventDate: claim.event_date,
  };
  const status: SearchProgress = { radius_mi: settings.radiusMi };

  try {
    const pool = combinePicks(claim.category, memberPicks(await findPicks(gameId), new Set(claim.active_member_ids)));
    const cache = await loadCache(gameId, claim.time_zone);
    const all = new Map(cache.candidates.map((c) => [`${c.source}:${c.sourceId}`, c]));
    let radiusMi = settings.radiusMi;
    const choose = () => chooseOptions([...all.values()], pool, settings, { radiusMi, alreadyShown: cache.shown });

    let result = choose();
    let searches = 0;
    let fetched = 0;
    let more = false;
    let failure: "budget" | "error" | null = null;

    const search = async (area: SearchArea) => {
      searches += 1;
      try {
        const page = await fetchPage(gameId, claim, area);
        for (const c of page.candidates) all.set(`${c.source}:${c.sourceId}`, c);
        fetched = (area.offset ?? 0) + page.consumed;
        more = page.more;
        if (page.candidates.length) await saveOptions(gameId, page.candidates, claim.claim_token);
      } catch (err) {
        if (err instanceof BudgetError) failure = "budget";
        else if (err instanceof ProviderError) failure = "error";
        else throw err;
        console.error(`search: ${errorLabel(err)}`);
      }
      result = choose();
    };

    // Saved places can't fill the round: search.
    if (result.needsWidening) {
      await search({ lat: claim.lat, lng: claim.lng, radiusMi });
      status.matches = result.options.length;
      await progress(gameId, status, claim.claim_token);
    }
    // Still short: widen by 5 mi once. A full first page means more places
    // exist nearby, so fetch the next page instead of the same nearest ones.
    if (result.needsWidening && !failure && searches < MAX_SEARCHES_PER_ROUND) {
      radiusMi += WIDEN_BY_MI;
      status.widened_to = radiusMi;
      await progress(gameId, status, claim.claim_token);
      await search({ lat: claim.lat, lng: claim.lng, radiusMi, offset: more ? fetched : 0 });
    }
    status.matches = result.options.length;

    if (result.options.length === 0) {
      if (failure) status.reason = failure;
      await finish(gameId, failure ? "unavailable" : "nothing_found", status, claim.claim_token);
      return;
    }
    const ids = await saveOptions(gameId, [], claim.claim_token); // read back every saved id
    const chosen = result.options
      .map((o: Scored) => ({ id: ids.get(`${o.source}:${o.sourceId}`), score: o.score }))
      .filter((o): o is { id: string; score: number } => Boolean(o.id));
    await finish(gameId, chosen.length ? "done" : "nothing_found", status, claim.claim_token, chosen);
  } catch (err) {
    if (err instanceof StaleSearchError) return;
    console.error(`search: ${errorLabel(err)}`);
    await finish(gameId, "unavailable", { ...status, reason: "error" }, claim.claim_token).catch(() => {});
  }
}
