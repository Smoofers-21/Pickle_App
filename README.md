# Pickle

A mobile web app that helps a group of friends decide where to go — a restaurant, a bar or an event — in a few minutes. Everyone joins a lobby with a code, can pick a **No preference** ("Not my ideal place") and a **Yes preference** ("I’d like to go"), both optional, and Pickle finds real places nearby, scores them against the group's picks, and runs a quick ranked vote to a top 3. A No lowers a matching option's score rather than vetoing it; a Yes boosts it rather than guaranteeing a match. When the same preference appears on both sides, it cancels out.

Built as a portfolio project to show full-stack work end to end: real-time multiplayer state, a locked-down database, third-party API integration on free tiers, a tested scoring algorithm and a mobile-first design system.

**Current status:** built through milestone 5: lobbies, host setup, picks, demo friends, the live search (Geoapify for restaurants and bars, Ticketmaster for events, with widening, a shared daily credit cap and the nothing-found screen), and swipeable option cards with illustrative cuisine photos (13 credited Unsplash photos so far). Leave lobby works from every screen. Voting and rounds follow in milestone 6.

## What it demonstrates

| Area | How |
|---|---|
| Real-time multiplayer | Supabase Realtime pings and Presence keep every phone's lobby in sync within about a second |
| Database design and security | Postgres with row-level security on every table and no browser access at all; all game rules live in SQL functions only the server can call; 132 SQL checks run in CI |
| API integration | Geoapify Places (OpenStreetMap data) for restaurants and bars and Ticketmaster for events, behind a swappable provider interface; all keys server-side; a shared daily credit budget reserved atomically in Postgres before every call |
| Algorithms | Cancel-out rule for conflicting picks, primary/secondary tag matching, distance scoring, chain de-duplication, radius widening, an OpenStreetMap opening-hours parser (unit tested on real data) |
| Security | HTTP-only device cookies (only their hash is stored), rate limits, request size limits, security headers, a pre-commit secret check, and a CI check that no key reaches the browser bundle |
| Frontend | Next.js 16 App Router PWA, a small black-and-white design kit, screens built to a design spec |

## Tech stack

| Part | Choice |
|---|---|
| Web app | Next.js 16 (App Router, TypeScript), installable as a PWA |
| Hosting | Vercel |
| Database and real-time | Supabase (Postgres, Realtime, Presence) |
| Places data | [Geoapify Places API](https://www.geoapify.com/places-api/) — free plan, OpenStreetMap data |
| Events data | [Ticketmaster Discovery API](https://developer.ticketmaster.com/) — free key |
| Tests | Vitest (app), plain Postgres 16 (database), both in GitHub Actions |

Every service runs on a free tier; no credit card is needed anywhere.

## Docs

- [Build order](docs/build-order.md): the order milestones are built in (start here)
- [Build plan](docs/build-plan.md): architecture, data model, API usage, security and each milestone's tests
- [Product spec](docs/product-spec.md): what the app does and how it looks
- [Screen designs](docs/screens/README.md) and [database setup](supabase/README.md)

## Run it locally

Needs Node.js 20.9 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000. The design kit preview is at http://localhost:3000/kit.

To create and join lobbies you need the settings below in a `.env.local` file (copy `.env.example`). Never commit `.env.local`.

## Settings and keys

Set these in Vercel (**Project → Settings → Environment Variables**, for Production and Preview) and in `.env.local` for local development. Anything secret is type **Secret** in Vercel and never starts with `NEXT_PUBLIC_` (the build stops if one does).

| Variable | Secret? | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | No (designed to be public) | Supabase → Project Settings → API Keys (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | **Yes** | Supabase → Project Settings → API Keys (`sb_secret_…`) |
| `GEOAPIFY_API_KEY` | **Yes** | Sign up free at [myprojects.geoapify.com](https://myprojects.geoapify.com), create a project, copy its API key. No credit card; the free plan allows 3,000 credits a day |
| `TICKETMASTER_API_KEY` | **Yes** | Sign up free at [developer.ticketmaster.com](https://developer.ticketmaster.com), open your app, copy the **Consumer Key** (not the Consumer Secret) |

**Database:** run each file in `supabase/migrations/` once, in order, in Supabase's SQL Editor. See [supabase/README.md](supabase/README.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app for development |
| `npm run build` | Production build (what Vercel runs) |
| `npm test` | Unit tests (scoring, tags, images, API boundary, rate limits) |
| `npm run lint` | Check code style |
| `npm run typecheck` | Check TypeScript types |
| `npm run check:bundle` | After a build: fail if any key name, key value or API address is in the browser code |
| `npm run check:secrets` | The pre-commit secret check (runs automatically on every commit) |
| `npm run images` | Resize the cuisine photos in `assets/restaurant-originals/` into `public/images/restaurants/` |
| `npm run logos` | Remake every logo and icon from `public/logo/pickle-logo.png` |

The SQL tests run on any Postgres 16; see [supabase/README.md](supabase/README.md).

## Security basics

- Secret keys live only in Vercel's environment settings and `.env.local`, are read through `src/lib/server-env.ts` (which can't be imported into browser code), and never use the `NEXT_PUBLIC_` prefix.
- Phones only talk to Pickle's own server routes and to Supabase Realtime; only the server calls Geoapify and Ticketmaster.
- Every commit runs a secret check (`.husky/pre-commit`), GitHub Actions runs [gitleaks](https://github.com/gitleaks/gitleaks), and `npm run check:bundle` runs after every CI build.
- Security headers (content security policy, no framing, strict referrer policy, location limited to this site) are set in `next.config.ts`.

## Data and image credits

- Restaurant and bar data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via [Geoapify](https://www.geoapify.com/). Event data: Ticketmaster.
- Restaurant and bar images are **illustrative** free stock photos (never the actual place), credited in [public/images/restaurants/CREDITS.md](public/images/restaurants/CREDITS.md).
