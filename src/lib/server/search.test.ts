import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@/lib/game/scoring";

// An in-memory stand-in for the database functions the search uses, and fake
// providers, so the search flow (cache, widening, budget, failures) can be
// tested without a network or keys.
const h = vi.hoisted(() => {
  const state = {
    claim: null as Record<string, unknown> | null,
    picks: [] as Record<string, unknown>[],
    options: [] as { id: string; source: string; source_id: string; shown_in_round: number | null; details: unknown }[],
    budget: true,
    progress: [] as unknown[],
    finished: null as null | { status: string; search: Record<string, unknown>; chosen: { id: string; score: number }[] },
    reserved: 0,
  };
  const query = (rows: () => unknown[]) => {
    const q = { select: () => q, eq: () => q, then: (ok: (v: unknown) => unknown) => ok({ data: rows(), error: null }) };
    return q;
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "claim_search":
        return { data: state.claim ?? { status: "busy" }, error: null };
      case "reserve_search_units":
        if (state.budget) state.reserved += args.p_units as number;
        return { data: state.budget ? "ok" : "budget", error: null };
      case "search_progress":
        state.progress.push(args.p_search);
        return { data: true, error: null };
      case "save_options":
        for (const o of args.p_options as { source: string; source_id: string; details: unknown }[]) {
          if (!state.options.some((x) => x.source === o.source && x.source_id === o.source_id)) {
            state.options.push({ id: `opt-${state.options.length + 1}`, source: o.source, source_id: o.source_id, shown_in_round: null, details: o.details });
          }
        }
        return {
          data: state.options.map((o) => ({ option_id: o.id, option_source: o.source, option_source_id: o.source_id })),
          error: null,
        };
      case "finish_search":
        state.finished = { status: args.p_status as string, search: args.p_search as Record<string, unknown>, chosen: args.p_chosen as { id: string; score: number }[] };
        return { data: { status: "ok" }, error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  });
  const from = (table: string) => query(() => (table === "picks" ? state.picks : state.options));
  return { state, rpc, from, geoSearch: vi.fn(), eventSearch: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ db: () => ({ rpc: h.rpc, from: h.from }) }));
vi.mock("./providers", () => {
  class ProviderError extends Error {}
  return {
    ProviderError,
    geoapify: { name: "geoapify", pageSize: 100, creditsPerSearch: () => 5, search: h.geoSearch },
    searchEvents: h.eventSearch,
  };
});
import { DAILY_CAP, memberPicks, runSearchIfNeeded } from "./search";
import { ProviderError } from "./providers";

const place = (name: string, cuisine: string, distanceMi: number): Candidate => ({
  source: "geoapify",
  sourceId: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  primary: [cuisine],
  secondary: [],
  distanceMi,
  openNow: null,
  card: { kind: cuisine },
});

const claim = {
  status: "ok",
  is_demo: false,
  claim_token: "claim-token",
  active_member_ids: ["seafood", "bbq", "country"],
  round: 1,
  rounds_total: 1,
  category: "food",
  event_date: null,
  radius_mi: 5,
  age: "all",
  indoor_outdoor: "either",
  time_zone: "America/Chicago",
  lat: 30.267,
  lng: -97.743,
};
const pick = (no: string, yes: string | null = null) => ({
  member_id: no,
  no_tag: no,
  no_other: null,
  yes_tag: yes,
  yes_other: null,
  submitted_at: "",
  ready: true,
});

beforeEach(() => {
  h.rpc.mockClear();
  Object.assign(h.state, { claim, picks: [pick("seafood", "italian"), pick("bbq")], options: [], budget: true, progress: [], finished: null, reserved: 0 });
  h.geoSearch.mockReset();
  h.eventSearch.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const six = ["Roma", "Napoli", "Milano", "Taco A", "Taco B", "Thai C"].map((n, i) =>
  place(n, i < 3 ? "italian" : i < 5 ? "mexican" : "thai", 0.2 + i * 0.1),
);

describe("runSearchIfNeeded", () => {
  it("stops a stale worker before spending budget or calling a provider", async () => {
    h.rpc.mockResolvedValueOnce({ data: claim, error: null }).mockResolvedValueOnce({ data: "stale", error: null });
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).not.toHaveBeenCalled();
    expect(h.state.finished).toBeNull();
  });
  it("uses saved demo samples without network calls or budget reservations", async () => {
    h.state.claim = { ...claim, is_demo: true };
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).not.toHaveBeenCalled();
    expect(h.eventSearch).not.toHaveBeenCalled();
    expect(h.state.reserved).toBe(0);
    expect(h.state.finished?.status).toBe("done");
    expect(h.state.finished?.chosen).toHaveLength(6);
  });
  it("ignores ready picks from removed or departed members", async () => {
    h.state.picks.push({ ...pick("italian"), member_id: "departed" });
    h.geoSearch.mockResolvedValue({ candidates: six, more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    expect(h.state.finished?.chosen).toHaveLength(6);
    expect(h.state.finished!.chosen.slice(0,3).map((c) => h.state.options.find((o) => o.id === c.id)!.source_id).sort()).toEqual(["milano", "napoli", "roma"]);
  });

  it("does not repeat an already-shown chain under a different provider ID", async () => {
    h.state.options = [{ id: "shown", source: "geoapify", source_id: "old-branch", shown_in_round: 1, details: place("Roma - Main St", "italian", 1) }];
    h.geoSearch.mockResolvedValue({ candidates: six, more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    expect(h.state.finished?.chosen.map((c) => h.state.options.find((o) => o.id === c.id)!.source_id)).not.toContain("roma");
  });

  it("passes the ownership token with every search mutation", async () => {
    h.geoSearch.mockResolvedValue({ candidates: six, more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    for (const [name, args] of h.rpc.mock.calls) {
      if (["reserve_search_units", "search_progress", "save_options", "finish_search"].includes(name)) expect(args.p_claim_token).toBe("claim-token");
    }
  });
  it("does nothing when another server holds the search", async () => {
    h.state.claim = null;
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).not.toHaveBeenCalled();
    expect(h.state.finished).toBeNull();
  });

  it("searches once, reserves its credits first, and shows the best 6", async () => {
    h.geoSearch.mockResolvedValue({ candidates: [...six, place("Fish Shack", "seafood", 0.1)], more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).toHaveBeenCalledOnce();
    expect(h.geoSearch.mock.calls[0][0]).toMatchObject({ lat: 30.267, lng: -97.743, radiusMi: 5 });
    expect(h.state.reserved).toBe(5);
    expect(h.state.finished?.status).toBe("done");
    expect(h.state.finished?.chosen).toHaveLength(6);
    const chosenNames = h.state.finished!.chosen.map((c) => h.state.options.find((o) => o.id === c.id)!.source_id);
    expect(chosenNames).not.toContain("fish-shack"); // the group's No
    expect(chosenNames.slice(0, 3).sort()).toEqual(["milano", "napoli", "roma"]); // the group's Yes first
    expect(h.state.options).toHaveLength(7); // every result is saved for later rounds
    expect(h.state.finished?.search).toMatchObject({ radius_mi: 5, matches: 6 });
    expect(JSON.stringify(h.state.progress)).not.toContain("30.267"); // progress never holds the location
  });

  it("widens by 5 mi once, fetching the next page when the first was full", async () => {
    h.geoSearch
      .mockResolvedValueOnce({ candidates: six.slice(0, 2), more: true, consumed: 100 })
      .mockResolvedValueOnce({ candidates: six.slice(2), more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).toHaveBeenCalledTimes(2);
    expect(h.geoSearch.mock.calls[1][0]).toMatchObject({ radiusMi: 10, offset: 100 });
    expect(h.state.finished?.status).toBe("done");
    expect(h.state.finished?.search).toMatchObject({ radius_mi: 5, widened_to: 10, matches: 6 });
    expect(h.state.reserved).toBe(10);
  });

  it("rescores what it already found before fetching again when it widens", async () => {
    // Six places 4 mi away that match nobody's picks: too far for the 5 mi
    // threshold, but they qualify within 10 mi without any new data.
    const neutral = ["Thai One", "Thai Two", "Thai Three", "Thai Four", "Thai Five", "Thai Six"].map((n) => place(n, "thai", 4));
    h.geoSearch.mockResolvedValueOnce({ candidates: neutral, more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).toHaveBeenCalledOnce(); // no second, paid search
    expect(h.state.reserved).toBe(5);
    expect(h.state.finished?.status).toBe("done");
    expect(h.state.finished?.chosen).toHaveLength(6);
    expect(h.state.finished?.search).toMatchObject({ radius_mi: 5, widened_to: 10, matches: 6 });
  });

  it("never searches more than twice in a round, and uses what it found", async () => {
    h.geoSearch.mockResolvedValue({ candidates: [six[0]], more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).toHaveBeenCalledTimes(2);
    expect(h.geoSearch.mock.calls[1][0].offset).toBe(0); // first page wasn't full: same start, wider circle
    expect(h.state.finished?.status).toBe("done");
    expect(h.state.finished?.chosen).toHaveLength(1);
  });

  it("uses saved places first, without calling the provider", async () => {
    h.state.options = six.map((c, i) => ({ id: `cached-${i}`, source: c.source, source_id: c.sourceId, shown_in_round: null, details: c }));
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).not.toHaveBeenCalled();
    expect(h.state.reserved).toBe(0);
    expect(h.state.finished?.chosen).toHaveLength(6);
  });

  it("reports nothing found when no place qualifies", async () => {
    h.geoSearch.mockResolvedValue({ candidates: [place("Fish Shack", "seafood", 0.1)], more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    expect(h.state.finished?.status).toBe("nothing_found");
    expect(h.state.finished?.search.reason).toBeUndefined();
  });

  it("stops at the daily budget without calling the provider", async () => {
    h.state.budget = false;
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).not.toHaveBeenCalled();
    expect(h.state.finished).toMatchObject({ status: "unavailable", search: { reason: "budget" } });
    expect(DAILY_CAP.geoapify).toBeLessThan(3000);
  });

  it("reports the provider as unavailable when it fails, and logs no details", async () => {
    h.geoSearch.mockRejectedValue(new ProviderError("timeout"));
    await runSearchIfNeeded("g1");
    expect(h.geoSearch).toHaveBeenCalledOnce(); // no retry, no widening after a failure
    expect(h.state.finished).toMatchObject({ status: "unavailable", search: { reason: "error" } });
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toMatch(/30\.267|api|key/i);
  });

  it("searches Ticketmaster for events on the chosen date", async () => {
    h.state.claim = { ...claim, category: "events", event_date: "2026-11-14", radius_mi: 10 };
    h.state.picks = [pick("country", "rock")];
    h.eventSearch.mockResolvedValue({ candidates: [], more: false, consumed: 100 });
    await runSearchIfNeeded("g1");
    expect(h.eventSearch).toHaveBeenCalledTimes(2);
    expect(h.eventSearch.mock.calls[0]).toEqual([{ lat: 30.267, lng: -97.743, radiusMi: 10 }, "2026-11-14"]);
    expect(h.eventSearch.mock.calls[1][0]).toMatchObject({ radiusMi: 15 });
    expect(h.state.finished?.status).toBe("nothing_found");
  });
});

describe("memberPicks", () => {
  it("uses only submitted (ready) picks and keeps Other text", () => {
    const rows = [
      { ...pick("seafood"), yes_tag: "other", yes_other: "Ramen" },
      { ...pick("bbq"), ready: false },
    ];
    expect(memberPicks(rows)).toEqual([{ no: { tag: "seafood" }, yes: { other: "Ramen" } }]);
  });

  it("keeps a Yes without a No, and skips members who picked neither", () => {
    const rows = [
      { ...pick("seafood"), no_tag: null, yes_tag: "italian" },
      { ...pick("bbq"), no_tag: null },
    ];
    expect(memberPicks(rows)).toEqual([{ no: null, yes: { tag: "italian" } }]);
  });
});
