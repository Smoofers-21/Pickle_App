# Pickle

@AGENTS.md

Mobile-first Next.js PWA for friend groups to pick a restaurant, bar or event by voting.

- Read `docs/build-order.md` first: it sets the milestone order. `docs/build-plan.md` and `docs/product-spec.md` define what each milestone contains.
- Screen images (01–19) go in `docs/screens/`; read the ones a milestone covers before building it.
- Build screens from the design kit in `src/components/ui/` (preview at `/kit`). Black on white, Outfit font, one main button per screen. The only accent is Pickle green #2F5E36 (the logo wordmark's green): selected Yes/No pills and the outline of the ranking being ordered (see Colors in the product spec).
- Secret keys (Supabase secret, Geoapify, Ticketmaster) are read only through `src/lib/server-env.ts` (server-only). Never give a secret the `NEXT_PUBLIC_` prefix. Only server code calls outside APIs.
- Places come from Geoapify (OpenStreetMap data) behind the `PlacesProvider` interface; events from Ticketmaster. Never use Google Places, ratings, or place photos. Restaurant and bar images come only from `public/images/restaurants/` (credits in its `CREDITS.md`), labelled as illustrative.
- Run all checks with `npm run check:all` (lint, typecheck, tests, build, bundle check, SQL tests; see `/check-all`). Apply migrations to hosted Supabase only with `/apply-migration`; review Codex branches with `/review-codex`; coordinate with other agents with `/coordinate`.
- Logo and icon files are made only by `npm run logos` from `public/logo/pickle-logo.png`. Never redraw or recolor the logo.
