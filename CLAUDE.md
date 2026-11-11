# Pickle

@AGENTS.md

Mobile-first Next.js PWA for friend groups to pick a restaurant, bar or event by voting.

- Read `docs/build-order.md` first: it sets the milestone order. `docs/build-plan.md` and `docs/product-spec.md` define what each milestone contains.
- Screen images (01–19) go in `docs/screens/`; read the ones a milestone covers before building it.
- Build screens from the design kit in `src/components/ui/` (preview at `/kit`). Black on white, Outfit font, one main button per screen.
- Secret keys (Supabase secret, Geoapify, Ticketmaster) are read only through `src/lib/server-env.ts` (server-only). Never give a secret the `NEXT_PUBLIC_` prefix. Only server code calls outside APIs.
- Places come from Geoapify (OpenStreetMap data) behind the `PlacesProvider` interface; events from Ticketmaster. Never use Google Places, ratings, or place photos. Restaurant and bar images come only from `public/images/restaurants/` (credits in its `CREDITS.md`), labelled as illustrative.
- Run all checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:bundle`, and the SQL tests in `supabase/README.md`.
- Logo and icon files are made only by `npm run logos` from `public/logo/pickle-logo.png`. Never redraw or recolor the logo.
