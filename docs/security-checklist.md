# Security and privacy checklist

Milestone 9's pass through every rule in [Security and privacy](build-plan.md#security-and-privacy), checked on Nov 18, 2026 against main plus the milestone 9 branch. **Done** items have the evidence next to them. **Owner** items are account settings only the owner can see; tick them off before a public demo.

## API keys (backend only)

| Rule | Status | Evidence |
|---|---|---|
| Geoapify, Ticketmaster and Supabase secret keys only in Vercel's server settings, never `NEXT_PUBLIC_` | Done | `next.config.ts` stops the build if a secret-looking name has the prefix; keys are read only through `src/lib/server-env.ts` (`server-only`) |
| Only server routes call Geoapify and Ticketmaster | Done | `npm run check:bundle` searches the browser bundle for keys and provider hosts; the content security policy's `connect-src` allows only this site and Supabase |
| No images loaded from a places API | Done | Cuisine photos are local files; `img-src` allows only this site and `*.ticketm.net` |
| Geoapify key sent in a header, never a URL | Done | `src/lib/server/providers.ts` (`x-api-key` header) |
| Ticketmaster key | Done, with one exception | Ticketmaster takes its key only in the URL. The server builds that URL and never logs it; the demo-event recorder runs in a GitHub Action with the key as a repository secret |
| Separate development and production keys; rotate the same day if one leaks | Owner | Vercel → Settings → Environment Variables: Production and Preview should hold different keys |

## Database

| Rule | Status | Evidence |
|---|---|---|
| Row-level security forced on every table, no policies, no browser grants | Done | `supabase/security-audit.sql` checks all 10 tables on the hosted project; `security_test.sql` locally |
| Every function callable only by the server | Done | The audit fails if `anon` or `authenticated` can run any function in `public` |
| Server decides stages, scores, points and winners | Done | All game rules are SQL functions (`start_game`, `submit_vote`, `tally_round`, …); phones only send picks and rankings |
| Every route checks its input | Done | Names, codes, tags, setup options and rankings are checked in the route and again in SQL; bodies over 2 KB are refused (`src/lib/server/api.ts`) |

## People's data and IP addresses

| Rule | Status | Evidence |
|---|---|---|
| Only a name, a random device token (hashed), picks and votes are stored | Done | `supabase/migrations/20261108000001_initial_schema.sql`; no email, phone or account columns |
| IP addresses never written to the database | Done | Rate limits by IP live in server memory only; the database buckets hold a device hash (`src/lib/server/rate-limit.ts`) |
| Log messages never contain IPs, keys, locations or member data | Done | `npm run check:logs` (new in milestone 9): every `console.method(...)` call in `src/` may print only fixed text, the request path and an error's name and code, and any other use of `console` fails. It reads source text, so it guards against mistakes, not deliberate tricks; code review covers the rest |
| Host's location rounded to about 100 m, never shown, deleted after the last search | Done | Rounded to 3 decimals in `src/lib/server/setup.ts`; deleted by `finish_search` and with the game (`search_test.sql`); demo games never send it |
| Cleanup of lobbies and everything in them after 24 hours | Done (milestone 9) | Lobbies stop working at 24 hours; `cleanup_old_data()` deletes them within the next hour through pg_cron (`20261118000001_cleanup_job.sql`, `cleanup_test.sql`). The audit checks the job's schedule, database, role and command |
| No ad trackers; analytics only from a privacy-focused tool | Done | Only Vercel Web Analytics, in production (no cookies, no stored IPs). It sends page views only, with lobby codes replaced by `[code]` (`src/lib/analytics.ts`); it records nothing until the owner turns it on in Vercel. The content security policy blocks every outside script |

## Website

| Rule | Status | Evidence |
|---|---|---|
| HTTPS and security headers | Done | `next.config.ts`: content security policy, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, strict referrer policy, HSTS, location limited to this site |
| Rate limits on every route, by device and IP | Done | `LIMITS` in `src/lib/server/rate-limit.ts`; wrong codes are limited separately (10 per device per 10 minutes) |
| Random 6-character codes with no look-alikes, ending after the game or 24 hours | Done | Code check in the schema (`^[A-HJ-NP-Z2-9]{6}$`); `expires_at`; Change lobby ends the old code |
| Device token in a secure, HTTP-only cookie | Done | `src/lib/server/device.ts`: `httpOnly`, `secure` in production, `sameSite: lax`; only its SHA-256 is stored |
| No raw HTML from users or APIs | Done | No `dangerouslySetInnerHTML` anywhere in `src/` |

## Accounts and code

| Rule | Status | Evidence |
|---|---|---|
| `.env` files ignored; secret check before commits | Done | `.gitignore`; `npm run check:secrets` and gitleaks in CI |
| Dependency audit | Done | `npm audit --omit=dev`: 0 vulnerabilities (Nov 18, 2026); also a CI step |
| Two-factor sign-in on GitHub, Vercel, Supabase, Geoapify and Ticketmaster | Owner | Each service's account security page |
| Dependabot alerts on | Owner | GitHub → Settings → Code security |

## Known limits (accepted for the demo)

- **Realtime channels are public.** Anyone who learns a lobby's internal id could listen for "changed" pings or send fake ones. Pings carry no data (phones reload from the server), and reloads after a ping are capped at one every 2 seconds.
- **Vercel's own request logs** are outside the app's control; on the Hobby plan they are kept for about an hour.
- Before any public launch: a short privacy policy (the app uses location) and a security review by someone besides Claude.
