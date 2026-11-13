Context revision: 4

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
- D5 (Nov 11, revised Nov 12): Pickle green #4A7C44 (`--pickle`) is the only accent: selected pills, host chip, share buttons, done chips and search check marks, card progress bars and Go vote (fills grey to green), home category pills, and the ranking outline (M6). Other main buttons stay black. Merged (PR #17; ranking outline in PR #19).
- D6 (Nov 11): Agent coordination via branch `agents/coordination` and `scripts/agent-coord.mjs`; Claude is coordinator.
- D7 (Nov 12): Leave lobby on every active screen (Codex PR #18, folded into PR #17). Merged.
- D9 (Nov 12): Both picks optional; host can remove stuck players on waiting screens. Merged (PR #19).
- D10 (Nov 13): Change lobby is host-only; everyone still in the lobby moves to a new code, the old code ends, nothing carries over (PR #20).
- D8 (Nov 12): Dependabot #2, #3, #4 applied (checkout/setup-node v7, React 19.3.1). Declined for now: #5 TypeScript 7 and #6 ESLint 10 (Next.js lint plugins unsupported), #7 @types/node 26 (runtime is Node 22).

## Current state

- Milestones 1–6 merged. Milestone 6 (voting and rounds) merged as PR #19 at main cc828c5.
- Database: every migration through 20261113000001 is applied to Supabase; 20261113000002 (Codex main-review fixes) is waiting for the owner's OK.
- In review: milestone 7 (results, directions, web search, Change lobby) plus the main-review fixes, PR #20 on claude/lucid-turing-tzka4n. Task T-m7-results, owner: claude-coordinator-0169tw.
- Next: milestone 8 (demo prep), then 9 (polish; includes the 24-hour cleanup job, still open).
