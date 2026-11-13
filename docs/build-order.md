# Pickle Build Order

Nov 8, 2026

This file sets the order to build Pickle in. It follows the 9 milestones in [build-plan.md](build-plan.md), with three changes listed below. Where this file and the build plan disagree on **order**, follow this file. For **what** each milestone contains (screens, rules, tests), the build plan and [product-spec.md](product-spec.md) still apply.

## Step 0: Before writing code

- [x] **Add the screen images.** Export one image per screen (01–19) from the screens canvas into `docs/screens/`. Milestones 2–7 are built from them.
- [x] **Fix the folder layout.** Done in milestone 1: the docs are in `docs/` and the logo in `public/logo/` at the repo root.
- [x] **Create the starting accounts:** GitHub, Vercel (connected to this repo) and Supabase, each with two-factor sign-in. Geoapify and Ticketmaster (both free) are needed from milestone 4.
- [x] **Draft the tag lists** for each category (food, bars, events). They're needed before milestone 3 (an open item in the product spec).

## Changes to the build plan

1. **Create the core data model and access rules in milestone 2.** All eight core gameplay tables and the operational `rate_limits` table are set up together in milestone 2. The second operational table, `api_usage`, is added with live search in milestone 4, bringing the current total to ten. Access rules keep every table locked down by default from its creation.
2. **Write the search and scoring logic in milestone 3, using sample data.** Combining picks, filtering, removing duplicates, scoring and choosing 6 are written as plain code with tests that run on saved sample data and need no API keys. Milestone 4 then only connects the places provider (Geoapify) and Ticketmaster and adds the game cache, widening and API cost rules.
3. **Build demo friends in milestone 3, not milestone 8.** Simulated members who pick and vote let one person test milestones 3–7 on one phone. The 3-phone tests stay as a final check before each merge. Milestone 8 shrinks to recording the saved sample search at the real demo location and checking a full demo game.

## Build order

| # | Milestone | Screens | Notes |
|---|---|---|---|
| 1 | Project setup and design kit | – | Next.js PWA on Vercel, Outfit font, shared buttons and chips, logo and icons, security headers, secret check before each commit. Docs and logo moved to the repo root. |
| 2 | Lobby and joining **+ core data model** | 01–06, 18, 19 | All eight core gameplay tables plus operational `rate_limits`, with their row-level rules (change 1); device-token cookie, Realtime member list, remove/leave and host handover. |
| 3 | Host setup and picks **+ scoring logic + demo friends** | 07–09 | Setup options, Yes/No tags, cancel-out rule, lobby locks. Scoring as tested code on sample data (change 2). "Add demo friends" with simulated picks (change 3). |
| 4 | Search with real data | 10–11 | Connect **Geoapify Places** (behind a swappable `PlacesProvider` interface) and Ticketmaster to the existing scoring code; add the operational `api_usage` table, game cache, widening by 5 mi, nothing-found screen, daily free-plan cap and call log; delete the host's location after the last search. Re-map the tags to OpenStreetMap categories and check them against live data. Set the score threshold from real searches. |
| 5 | Option cards | 12 | Local **cuisine image library** (free stock photos with a credits file, labelled "Illustrative photo"), Ticketmaster images for events, Geoapify / OpenStreetMap attribution, Go vote unlocks after every card is seen. |
| 6 | Voting and rounds | 13–15 | Drag to rank, points, tie-breaks, 2–3 rounds, final vote. Demo friends also vote. |
| 7 | Results and replay | 16–17 | Top 3, directions in Apple or Google Maps, web search link, Change lobby. |
| 8 | Demo prep | – | Record the saved sample search at the demo location; run a full demo game alone on one phone. |
| 9 | Polish and demo prep | 04 and others | Loading and error states, daily cleanup job, free-plan limits checked, slow-connection check, security and privacy checklist, portfolio README (screenshots, architecture, what it demonstrates). |

## Later changes

- **Nov 10, 2026:** Google cost rules (Pro fields only, open now, one shared photo). Replaced the next day.
- **Nov 11, 2026: Geoapify instead of Google Places.** The project runs entirely on free tiers for a portfolio and public demos: Geoapify Places (OpenStreetMap data) for restaurants and bars, Ticketmaster for events, and a local library of illustrative cuisine photos instead of place photos. No ratings are used. See "Places data provider" and "Cuisine images" in the build plan.
- **Nov 11, 2026: milestone 4 checked against the live APIs.** Geoapify charges 1 credit per 20 places, so one search for the nearest 100 places costs 5 credits; widening fetches the next 100. Results may be cached ("Cache/store results with no limits"), and the free plan requires both Geoapify and OpenStreetMap attribution. The key is sent in a header, never in a URL. "Open now" uses the host's phone time zone. The host's location is also deleted after a failed search (changing the criteria sends a fresh one). The score threshold stays at 60 after real searches in Austin and New York.

- **Nov 11, 2026: Pickle green accent.** The owner wants the app to match the logo: selected Yes / No pills (milestone 5, screen 08) and the outline of the ranking being ordered (milestone 6, screens 13 and 15) use the logo wordmark's green, \#2F5E36. Everything else stays black and white. See Colors in the product spec.
- **Nov 12, 2026: more Pickle green, lighter.** The owner widened the accent and asked for a lighter shade: \#4A7C44 (the lightest green that keeps white text readable, 4.9:1) for the selected pills (Yes / No picks, setup options), the host's member chip, the share buttons, the done chips on the waiting screen, the check marks on the searching screen, the card progress bars, the Go vote button (filling from grey to green as cards are seen), the outline and text of the home screen's Food / Bars / Events pills, and the outline of the ranking you're ordering (screens 13 and 15). Other main buttons stay black.
- **Nov 12, 2026: wording.** The picks are labelled "Not my ideal place" ("Not my ideal event" for events; the required No) and "I’d like to go" (the optional Yes); the home slogan is "Pickle together. Go together."; the ranking screens say "Put your favorite first: everyone's ranking counts toward the result." (owner, with Codex's suggestion).
- **Nov 12, 2026: optional picks and stuck players.** Both picks are optional (migration `20261112000004_optional_no_pick.sql`). On the waiting screens the host can remove anyone who isn’t done, shown as "offline" when their phone dropped (Codex’s suggestion).

## How each milestone runs

1. Start the milestone by pointing Claude at this file, the build plan, the product spec and the milestone's screen images.
2. Claude builds it on its own branch and opens a pull request with a summary and a test checklist.
3. Vercel creates a preview link for the pull request.
4. Test on your phone with the milestone's test step, using demo friends from milestone 3 on, then once with real phones before merging.
5. Report problems; Claude fixes them on the same branch.
6. When it passes, merge and start the next milestone.

If a decision changes during the build, update the product spec first, then this file if the order changes.
