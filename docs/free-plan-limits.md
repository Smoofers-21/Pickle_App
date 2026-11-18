# Free-plan limits

Pickle runs entirely on free plans with no card attached, so a limit can stop the app but never cost money. Checked Nov 18, 2026 against each service's pricing page (they change; look again before a public demo).

| Service | Free limit that matters | What Pickle uses | Headroom |
|---|---|---|---|
| Geoapify | 3,000 credits a day | 5 credits per places search (100 places), 10 if a round widens. Pickle's own cap: 2,500 a day, reserved in Postgres before every call | About 250 live food or bar games a day; demo games cost nothing |
| Ticketmaster | 5,000 calls a day, 5 a second | 1 call per events game. Pickle's own cap: 4,500 a day | Thousands of games a day |
| Supabase database | 500 MB | A finished game is a few KB, and the cleanup job deletes every lobby after 24 hours | Effectively unlimited |
| Supabase Realtime | 200 connections at once, 2 million messages a month | 1 connection per open phone; a few pings per stage change | About 20 full 10-person lobbies at the same moment |
| Supabase pausing | A free project pauses after about a week with no activity | — | **Open the app (or run a game) within a week before a demo.** A paused project is restored from the Supabase dashboard |
| Vercel Hobby | 1 million function calls, 4 hours of active CPU and 100 GB of transfer a month | A phone checks in every 30 seconds plus once per change: roughly 50–100 calls per phone per game. A first visit is about 240–290 KB (`npm run measure:slow`) | About 1,500–3,000 phone-games a month |

When a cap is reached:

- **Geoapify or Ticketmaster (Pickle's own daily cap):** the search stops and the host sees the nothing-found screen with "try again later". Usage per day is in the `api_usage` table (counts only).
- **Supabase Realtime connections:** phones still update through the 30-second check-in, just more slowly.
- **Vercel:** the Hobby plan stops serving functions until the month resets. Check Vercel → Usage before a demo.

Hobby is for non-commercial use, which fits a portfolio project.

## Slow connections

Time until each page is usable (its main button, code boxes or lobby heading showing and the page responding), measured with `npm run measure:slow`: the production build, Chrome's network presets, the lobby's answer delayed by one round trip plus 300 ms. Nov 18, 2026:

| Network | Home | Enter code | Lobby |
|---|---|---|---|
| Fast 3G | 1.7 s | 1.5 s | 2.5 s |
| Slow 3G | 5.7 s | 4.9 s | 7.3 s |

On a slow connection the lobby says "Your connection may be slow" after 8 seconds instead of a silent wait. These are lab numbers from one machine, not a full game on a real phone. If the connection drops mid-game, a bar says so and the screen keeps the last update, retrying every 5 seconds; if the lobby can't load at all, the screen offers Try again and Back.
