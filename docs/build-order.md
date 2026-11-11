# Pickle Build Order

Nov 8, 2026

This file sets the order to build Pickle in. It follows the 9 milestones in [build-plan.md](build-plan.md), with three changes listed below. Where this file and the build plan disagree on **order**, follow this file. For **what** each milestone contains (screens, rules, tests), the build plan and [product-spec.md](product-spec.md) still apply.

## Step 0: Before writing code

- [x] **Add the screen images.** Export one image per screen (01–19) from the screens canvas into `docs/screens/`. Milestones 2–7 are built from them.
- [x] **Fix the folder layout.** Done in milestone 1: the docs are in `docs/` and the logo in `public/logo/` at the repo root.
- [x] **Create the starting accounts:** GitHub, Vercel (connected to this repo) and Supabase, each with two-factor sign-in. Geoapify and Ticketmaster (both free) are needed from milestone 4.
- [x] **Draft the tag lists** for each category (food, bars, events). They're needed before milestone 3 (an open item in the product spec).

## Changes to the build plan

1. **Create every table and access rule in milestone 2.** All 8 Supabase tables and their row-level security rules are set up together in milestone 2, not added milestone by milestone. This designs the access rules as one set and keeps every table locked down by default from the start.
2. **Write the search and scoring logic in milestone 3, using sample data.** Combining picks, filtering, removing duplicates, scoring and choosing 6 are written as plain code with tests that run on saved sample data and need no API keys. Milestone 4 then only connects the places provider (Geoapify) and Ticketmaster and adds the game cache, widening and API cost rules.
3. **Build demo friends in milestone 3, not milestone 8.** Simulated members who pick and vote let one person test milestones 3–7 on one phone. The 3-phone tests stay as a final check before each merge. Milestone 8 shrinks to recording the saved sample search at the real demo location and checking a full demo game.

## Build order

| # | Milestone | Screens | Notes |
|---|---|---|---|
| 1 | Project setup and design kit | – | Next.js PWA on Vercel, Outfit font, shared buttons and chips, logo and icons, security headers, secret check before each commit. Docs and logo moved to the repo root. |
| 2 | Lobby and joining **+ full data model** | 01–06, 18, 19 | All 8 tables and their row-level rules (change 1), device-token cookie, Realtime member list, remove/leave, host handover, rate limits. |
| 3 | Host setup and picks **+ scoring logic + demo friends** | 07–09 | Setup options, Yes/No tags, cancel-out rule, lobby locks. Scoring as tested code on sample data (change 2). "Add demo friends" with simulated picks (change 3). |
| 4 | Search with real data | 10–11 | Connect **Geoapify Places** (behind a swappable `PlacesProvider` interface) and Ticketmaster to the existing scoring code; game cache, widening by 5 mi, nothing-found screen, daily free-plan cap and call log, delete the host's location after the last search. Re-map the tags to OpenStreetMap categories and check them against live data. Set the score threshold from real searches. |
| 5 | Option cards | 12 | Local **cuisine image library** (free stock photos with a credits file, labelled "Illustrative photo"), Ticketmaster images for events, Geoapify / OpenStreetMap attribution, Go vote unlocks after every card is seen. |
| 6 | Voting and rounds | 13–15 | Drag to rank, points, tie-breaks, 2–3 rounds, final vote. Demo friends also vote. |
| 7 | Results and replay | 16–17 | Top 3, directions in Apple or Google Maps, web search link, Change lobby. |
| 8 | Demo prep | – | Record the saved sample search at the demo location; run a full demo game alone on one phone. |
| 9 | Polish and demo prep | 04 and others | Loading and error states, daily cleanup job, free-plan limits checked, slow-connection check, security and privacy checklist, portfolio README (screenshots, architecture, what it demonstrates). |

## Later changes

- **Nov 10, 2026:** Google cost rules (Pro fields only, open now, one shared photo). Replaced the next day.
- **Nov 11, 2026: Geoapify instead of Google Places.** The project runs entirely on free tiers for a portfolio and public demos: Geoapify Places (OpenStreetMap data) for restaurants and bars, Ticketmaster for events, and a local library of illustrative cuisine photos instead of place photos. No ratings are used. See "Places data provider" and "Cuisine images" in the build plan.

## How each milestone runs

1. Start the milestone by pointing Claude at this file, the build plan, the product spec and the milestone's screen images.
2. Claude builds it on its own branch and opens a pull request with a summary and a test checklist.
3. Vercel creates a preview link for the pull request.
4. Test on your phone with the milestone's test step, using demo friends from milestone 3 on, then once with real phones before merging.
5. Report problems; Claude fixes them on the same branch.
6. When it passes, merge and start the next milestone.

If a decision changes during the build, update the product spec first, then this file if the order changes.
