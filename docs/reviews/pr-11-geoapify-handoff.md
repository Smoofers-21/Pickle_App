# PR #11 handoff: Geoapify instead of Google Places

For: an independent review (Codex) of [PR #11](https://github.com/Smoofers-21/Pickle_App/pull/11).
Branch: `claude/lucid-turing-tzka4n`, commit `f45e9ef` on top of `main` (`717018d`, milestone 3 merged).
Written by Claude, Nov 11, 2026.

## Why

The owner wants Pickle to run entirely on free tiers so it can be a public portfolio project. Google Places was replaced by **Geoapify Places** (OpenStreetMap data), and restaurant/bar photos from an API were replaced by a **local library of illustrative cuisine photos**. This PR changes the plan and prepares the code. The live search is not built yet; that's milestone 4.

It started from a Codex proposal ("2gthr MVP Update: Geoapify and Cuisine-Based Images"), adapted as described below.

## Decisions (owner)

- **Name stays Pickle.** The proposal's "2gthr" was not adopted; logo, icons and repo are Pickle.
- **Images are free stock photos** (Unsplash/Pexels) that the owner downloads; processed copies are committed with a credits file. Not drawn illustrations.
- **Events stay on Ticketmaster** (free) and keep Ticketmaster's own event images.
- **No ratings, reviews or place photos** from any API.

## How the proposal was adapted

| Proposal item | What this PR does |
|---|---|
| 1–3. Geoapify for names, addresses, coordinates, categories; remove Google; no ratings or photos | Planned for milestone 4 in the spec and build plan; `GEOAPIFY_API_KEY` replaces `GOOGLE_PLACES_API_KEY` in code and checks; ratings removed from scoring |
| 4–6. Local cuisine images in `public/images/restaurants/`, auto-assigned with a default | Folder, photo list (12 required, 22 optional with fallbacks), `CREDITS.md`, `npm run images` resize script, and `cuisineImage()` with a fallback chain |
| 7. No image requests to external APIs during voting | Written into the build plan's API rules; cards use local files (events: Ticketmaster image URLs from the event data) |
| 8. Label images as illustrative | `cuisineImage()` returns `illustrative: true`; spec says cards show "Illustrative photo" (UI is milestone 5) |
| 9. Keep group creation, matching, voting and winner selection unchanged | No changes to lobby, picks, voting or database code; scoring changes only the weights |
| 10. Key server-side, reasonable limits | Server-only via `serverSecret("GEOAPIFY_API_KEY")`; build guard, secret check and bundle check updated; plan adds a daily cap at ~2,500 credits on our side (free plan: 3,000) plus existing rate limits |
| 11. Geoapify/OSM attribution | Spec and plan require "Powered by Geoapify · © OpenStreetMap contributors" wherever place data appears; README credits section |
| 12. Swappable provider | Plan defines a `PlacesProvider` interface (search → `Candidate[]`); scoring already works on the provider-neutral `Candidate` type. The interface itself is written in milestone 4 |

Additional adaptations not in the proposal:

- **Scoring without ratings:** distance is worth up to 20 points (was 10, plus 10 for rating/Google rank). Without this, a place with no Yes/No match tops out near 60 and rounds come back nearly empty.
- **Open now:** taken from OpenStreetMap `opening_hours` when present; places without hours are kept (`openNow: null`), because OSM hours are often missing. Field renamed `openToday` → `openNow`.
- **Tags re-mapped to OSM:** cuisine values (`italian`, `pizza`, `sushi`, `steak_house`…) and bar types (`pub`, `nightclub`, `biergarten`). Tags with no OSM category (Fine dining, Sports bar, Cocktail bar, Wine bar, Karaoke, Live music, Lounge, Rooftop) are marked *best effort* and match mainly by keyword.
- **Caching:** OSM data (ODbL) may be stored with attribution; the game cache keeps it for the game and deletes it with the game (privacy rule unchanged).

## Files changed

Docs:
- `docs/product-spec.md`: sources, tags table (OSM mappings), match score, cards, retention, API keys, data limits, tech stack.
- `docs/build-plan.md`: architecture note, options table, search steps 2/3/7, score table, new "Places data provider" and "Cuisine images" sections, rewritten "API cost", security bullets, milestones 4/5/7, accounts table, risks.
- `docs/build-order.md`: milestone 4/5/9 rows, Step 0 ticks, "Later changes" log.
- `docs/screens/README.md`: card and attribution notes.
- `README.md`: rewritten for a portfolio (what it demonstrates, stack, keys and where to get them, scripts, security, credits).
- `CLAUDE.md`: provider, image and checks guidance.

Code:
- `src/lib/server-env.ts`, `.env.example`, `next.config.ts` (NEXT_PUBLIC_ guard), `scripts/check-secrets.mjs`, `scripts/check-client-bundle.mjs` (now also forbids `GEOAPIFY_API_KEY` and `api.geoapify.com` in browser assets).
- `src/lib/game/tags.ts`: OSM categories and keywords.
- `src/lib/game/scoring.ts`: `source: "geoapify" | "ticketmaster"`, `rating` and `ratingPoints` removed, `distanceMax: 20`, `openNow`.
- `src/lib/game/scoring.test.ts`: updated to OSM-style data and the new weights; new test that a no-match place halfway across the radius scores exactly 60.
- `src/lib/game/cuisine-images.ts` (+ `.test.ts`, `.generated.ts`): OSM cuisine/bar type → image key, fallback chain (greek → mediterranean, brunch → breakfast, brewery → pub), then restaurant/bar default, then `null` (placeholder) when no images exist yet.
- `scripts/process-cuisine-images.mjs` + `npm run images`: crops originals from `assets/restaurant-originals/` (gitignored) to 1200 × 800 JPEG and regenerates `cuisine-images.generated.ts`.
- `public/images/restaurants/README.md`, `CREDITS.md`.
- `vitest.config.ts` → `vitest.config.mts` (silences a CommonJS warning; no behavior change).

Not changed: database schema and migrations, API routes, screens, lobby/picks/voting logic.

## Verification

- `npm test`: 39 passed (5 new image tests).
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:bundle`: pass.
- CI on PR #11: `check` and `database` (76 SQL checks) green; Vercel preview built.
- Owner has added `GEOAPIFY_API_KEY` to Vercel.

## Not verified (please check)

Geoapify's documentation sites (`apidocs.geoapify.com`, `www.geoapify.com`) were not reachable from Claude's environment. Confirmed only through search results: free plan of 3,000 credits/day with no credit card, about 1 credit per simple Places request, and category names of the form `catering.restaurant.italian`. Unconfirmed and planned for verification against the live API in milestone 4:

1. The exact Geoapify category names for bars, pubs, beer gardens and nightclubs.
2. Whether OSM `cuisine`, `opening_hours`, `outdoor_seating`, `website`, `diet:*`, `live_music` and `sport` tags come through in the response (for example under `datasource.raw`).
3. Credits per request when asking for many results (page size ~50 is assumed), and the maximum `limit`.
4. The exact attribution wording and placement Geoapify requires.
5. Whether Geoapify's terms allow caching results for the length of a game.

## Suggested review focus

- Do the OSM mappings in `tags.ts` and `cuisine-images.ts` match real OSM `cuisine` values and Geoapify categories?
- Is distance up to 20 points (threshold 60) a sensible replacement for the rating signal, or should the threshold move instead?
- Any remaining Google references or Google-specific assumptions in code or docs (intentional ones: Apple/Google Maps directions links, Google Fonts, and the bundle check still forbidding `GOOGLE_PLACES_API_KEY` / `places.googleapis.com` as a safety net).
- Anything in the plan's free-tier limits (daily cap at ~2,500 credits, ≤2 searches per round) that looks wrong for Geoapify's actual billing.
