Context revision: 3

# Project context: Pickle

Accepted goals, constraints and decisions. Only the coordinator
(Claude) changes this file. Proposals go to `.agent/channel.md` first.
The full specs are in the repo: `docs/build-order.md`, `docs/build-plan.md`,
`docs/product-spec.md`. This file records the decisions agents must share.

## Goals

- Mobile-first Next.js PWA for friend groups to pick a restaurant, bar or event by voting.
- Portfolio project: runs entirely on free tiers, built milestone by milestone (`docs/build-order.md`).
- Owner: tests on phones and merges every PR. Owner has final authority.

## Constraints

- Secret keys only server-side via `src/lib/server-env.ts`; never `NEXT_PUBLIC_`; only server code calls outside APIs.
- All DB access through SQL functions callable only by service_role; browser roles have no table or function access.
- Migrations: never edit an applied file; add a new one. Applying to hosted Supabase needs the owner's OK.
- Places: Geoapify (OpenStreetMap) behind `PlacesProvider`; events: Ticketmaster. No Google Places, ratings or place photos.
- Never log keys, locations, IPs, provider error bodies or request URLs.
- Claude pushes only to `claude/lucid-turing-tzka4n` and `agents/coordination`; Codex works on its own `security/*` branches.

## Decisions

- D1 (Nov 11): Geoapify replaces Google Places; local illustrative cuisine photos. Merged (PR #11).
- D2 (Nov 11): Search fenced by a private claim token per search (migration 20261111000003). Merged, applied to Supabase.
- D3 (Nov 11): Demo lobbies use saved samples, never live API credits (Codex review). Merged.
- D4 (Nov 11): Vercel Web Analytics, production only, URLs sanitized. Merged; owner enables it in Vercel.
- D5 (Nov 11, revised Nov 12): Pickle green #4A7C44 (`--pickle`) is the only accent: selected pills, host chip, share buttons, done chips and search check marks, card progress bars and Go vote (fills grey to green), home category pills, and the ranking outline (M6). Other main buttons stay black. Merged (PR #17) except the M6 outline.
- D6 (Nov 11): Agent coordination via branch `agents/coordination` and `scripts/agent-coord.mjs`; Claude is coordinator.
- D7 (Nov 12): Leave lobby on every active screen (Codex PR #18, folded into PR #17). Merged.
- D8 (Nov 12): Dependabot #2, #3, #4 applied (checkout/setup-node v7, React 19.3.1). Declined for now: #5 TypeScript 7 and #6 ESLint 10 (Next.js lint plugins unsupported), #7 @types/node 26 (runtime is Node 22).

## Current state

- Milestones 1–5: merged. Milestone 5 (option cards, 13 credited cuisine photos, Pickle green, Leave lobby) merged as PR #17 at main d2d0890.
- Database: all migrations through 20261111000003 applied to Supabase; no migrations in PR #17.
- Next: milestone 6 (voting and rounds: drag to rank, points, tie-breaks, 2–3 rounds, final vote, demo friends vote; ranking outline in Pickle green). Task T-m6-voting, owner: claude-coordinator-0169tw.
