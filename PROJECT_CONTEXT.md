# Project context: Pickle

Context revision: 1

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
- D2 (Nov 11): Search fenced by a private claim token per search (migration 20261111000003). Implemented in PR #13, applied to Supabase.
- D3 (Nov 11): Demo lobbies use saved samples, never live API credits (Codex review). Implemented in PR #13.
- D4 (Nov 11): Vercel Web Analytics, production only, URLs sanitized. Implemented in PR #13; owner enables it in Vercel after merge.
- D5 (Nov 11): Pickle green #2F5E36 is the only accent: selected Yes/No pills (M5), ranking outline (M6). Documented; to implement.
- D6 (Nov 11): Agent coordination via branch `agents/coordination` and `scripts/agent-coord.mjs`; Claude is coordinator.

## Current state

- Milestones 1–3: merged. Milestone 4 (search): PR #13 open, includes Codex's PR #14 commits; owner to test, merge #13, close #14.
- Database: all migrations through 20261111000003 applied to Supabase; security audit passed.
- Next: skills /check-all, /apply-migration, /review-codex (Claude); then milestone 5 (option cards). Owner to supply cuisine photos.
