# Pickle MVP Build Plan

Nov 4, 2026 · @Santiago Perez Alferez

This plan turns the [Pickle MVP Product Spec](https://claude.ai/artifact/4oRMc4wEYKKGZwJzTFWMWE) into 9 milestones you can build and test one at a time, using the screens on the [Pickle screens canvas](https://claude.ai/artifact/TdTMjkpAfcNUVMX1JjMkMF).

## Architecture

Phones only show screens and send actions; server routes on Vercel do the work, store it in Supabase, and Supabase pushes changes back to every phone.

![Architecture diagram](images/architecture.png)

architecture · 6 parts

Google Places and Ticketmaster are called only by the server, so API keys and costs stay under control.

## Data model

Eight tables in Supabase (Postgres) hold everything. No user accounts: a member is identified by a random token saved in their browser, plus the name they typed. The database stores only a hash of the token (members.device_token_hash), plus members.left_at for members who left on their own and a rate_limits table keyed by device.

| Table         | What it holds                                                                                                                                              | Key fields                                                                                                                                                                                                  |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| lobbies       | One row per lobby code (plus current_game_id, the game in progress)                                                                                                                                     | code (6 characters), status (open, locked, ended), host_member_id, is_demo, next_lobby_id, expires_at (24 hours)                                                                                            |
| members       | People in a lobby                                                                                                                                          | lobby_id, name (with number suffix for duplicates), device_token, joined_at (sets host order), is_demo, removed_at, last_seen_at                                                                            |
| games         | One game inside a lobby                                                                                                                                    | lobby_id, category, event_date, radius_mi, age, indoor_outdoor, rounds_total, current_round, stage, center_lat, center_lng                                                                                  |
| picks         | Each member's Yes and No                                                                                                                                   | game_id, member_id, no_tag, no_other, yes_tag (optional), yes_other: a tag key, or "other" plus the typed text                                                                                                                                                  |
| options       | Every place or event found during the game, shown or not (the game's search cache). Google details other than the place ID are deleted when the game ends. | game_id, shown_in_round (empty until shown), source (google or ticketmaster), source_id, name, normalized_name, tags, photos (up to 3), hours or start time, rating, distance_mi, link, score (never shown) |
| card_views    | Which cards a member has seen                                                                                                                              | member_id, option_id; used to unlock Go vote                                                                                                                                                                |
| votes         | One ranking per member per round                                                                                                                           | game_id, round_no (0 = final), member_id, ranking (ordered option ids), submitted_at                                                                                                                        |
| round_results | Points and who advanced                                                                                                                                    | game_id, round_no, option_id, points, first_place_votes, place, advanced                                                                                                                                    |

The game's **stage** drives every screen: picks → searching → cards_and_voting → round_complete → final_vote → results. Each phone shows the screen for the current stage; within cards_and_voting, each member moves from cards to voting at their own pace.

## Real-time lobby

Every phone subscribes to its lobby through Supabase Realtime, so joins, picks and votes appear on all screens within about a second, without refreshing.

- **What phones listen to:** an empty "changed" ping on a Realtime broadcast channel named after the lobby's random id, sent by a database trigger whenever the lobby or its members change. The ping carries no data; the phone then asks the server for the lobby as it should see it (and checks in every 30 seconds in case a ping is missed). Phones never read tables directly and never receive other members' picks or rankings, which keeps picks anonymous. *(Decided in milestone 2.)*

- **Who moves the game forward:** the server, not the phones. When the last pick or vote arrives, a server route advances the stage (for example voting → round_complete) and every phone follows.

- **Cards and voting:** each member moves through cards and voting at their own pace. The round ends when every active member has submitted a ranking, or the host removes someone who is stuck.

- **Online status:** Supabase Presence shows who is connected. A dropped phone reconnects with its saved token and lands on the current stage with its progress intact.

- **Host handover:** if the host leaves or is removed, the server makes the earliest-joined active member the host and sends the "You're now the host" notice.

- **Security:** phones can't read or write any table. Every action (join, pick, vote) goes through a server route that checks the device token, the stage and the input, then writes with the secret key. *(Decided in milestone 2: stricter than per-member database rules, and it keeps the device token out of page scripts.)*

## Search and scoring

A server route fills each round, calling the APIs only when saved results can't, so API keys never reach the phones. It returns up to 6 options, each with a hidden score from 0 to 100.

1.  **Combine picks.** Collect every Yes and No. Drop any tag that is both someone's Yes and someone else's No.

2.  **Search.** First use places already found earlier in this game; call the APIs only if those can't fill the round. Food and bars: Google Places nearby search around the host's location, within the radius. Events: Ticketmaster search by location, radius and the chosen date.

3.  **Filter.** Keep places open today, events on the chosen date, and 21+ venues only when the host allowed them. Remove anything already shown earlier in this game.

4.  **Remove duplicates.** Normalize names (lowercase, no punctuation or location suffix) and keep the closest location of each chain.

5.  **Score.** Start every option at 50, then apply the adjustments below.

6.  **Pick 6.** Keep options at or above the threshold (about 60), highest first. Fewer than 6: widen the radius by 5 mi once and search again; places already found are recognized by their source ID and skipped, never fetched or scored twice. Still fewer: use what was found. None: tell the host.

7.  **Fetch details for the 6 only.** Photos (up to 3), hours and links are requested only for the final options, and only once per place per game. Every result from every search is saved to the options table, so later rounds draw from it before calling the APIs again.

**Starting score adjustments** (to be tuned with real searches)

| Signal                                | Adjustment |
|---------------------------------------|------------|
| Each Yes that matches a primary tag   | +15        |
| Each Yes that matches a secondary tag | +8         |
| Each No that matches a primary tag    | −40        |
| Each No that matches a secondary tag  | −10        |
| Indoor/outdoor preference matches     | +5         |
| Rating (4.5 or higher = full points)  | up to +10  |
| Distance (closest = full points)      | up to +10  |

Primary and secondary tags come from each source's own categories: for Google, the place's main type versus its other types; for Ticketmaster, the event's genre versus its subgenre.

## API cost

The goal is about one Google search per round, details for at most 6 places, and no repeated work within a game. These rules are built into milestones 4 and 5 from the start.

1.  **Request only the fields needed.** Google bills a request at the most expensive tier among the fields it asks for. The first search asks only for basics (place ID, name, location, types); hours, rating and photos come later. ([Google SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details/places))

2.  **Search broadly once, detail only the winners.** One nearby search returns up to 20 places. All are scored with the basic data; details are fetched only for the top 6. The rest are saved for later rounds, so a multi-round game can often run on one search.

3.  **Load photos lazily.** Each photo is its own billed request. Photo 1 loads when a card appears; photos 2 and 3 load only when someone taps for them.

4.  **Never repeat work within a game.** Saved results are used first, and a wider search skips places already found (see Search and scoring).

5.  **Saved data for demos and testing.** Demo mode and development run on a saved sample search, which costs nothing and keeps demos reliable.

6.  **Ticketmaster in one batch.** A default key is free, limited to 5,000 calls a day and 5 a second. ([Ticketmaster docs](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/)) One call fetches a large batch of events for the whole game.

7.  **Hard limits and logging.** A daily quota cap and budget alert in Google Cloud, a server limit of at most 2 Google searches per round, and a log of every API call to track the real cost per game.

Google allows place IDs to be stored indefinitely, but other Places content must not be cached or stored beyond its allowed exceptions ([Places API policies](https://developers.google.com/places/web-service/policies)). So the game cache keeps Google details only while a game is running, and any future cache shared between lobbies would store place IDs only. Confirm the details against the Google Maps Platform service terms before launch.

## Security and privacy

Secret keys live only on the server, every database table is locked down by default, and the app stores as little about people as it can: a name, a random device token and nothing else. These rules apply from milestone 1, not as a final clean-up.

**API keys (backend only)**

- Google, Ticketmaster and the Supabase secret key (called the service_role key in Supabase's older key system) are stored only in Vercel's server environment settings. None of them uses the NEXT_PUBLIC\_ prefix, because Next.js sends any variable with that prefix to the browser.

- Only server routes call Google and Ticketmaster. Phones call our own routes, so no outside API URL or key ever appears in the browser's network traffic.

- Photos are loaded through the server, so the Google key never appears in an image address.

- The Google key is restricted to the Places API only, with a daily quota cap and a budget alert, so a leaked key can do little and cost little.

- Separate keys for development and production. If a key ever leaks, rotate it in that service's console the same day.

**Database**

- Row-level security is turned on for every Supabase table, with no policies at all, and the browser roles have no grants, so the publishable key can read and write nothing. Only server routes, using the secret key, touch the tables.

- The Supabase publishable key (formerly the anon key) is designed to be visible in the browser; the row-level rules are what protect the data. The secret key bypasses those rules, so it stays on the server. Use Supabase's new publishable and secret keys from the start, since the older keys are being deprecated.

- The server decides everything that matters: stage changes, scores, points and winners. Phones can't skip ahead or submit a vote for someone else.

- Every server route checks its input: name length and characters, a valid lobby code, tags from the allowed list, and rankings containing only that round's options.

**People's data and IP addresses**

- Collected: a display name, a random device token, picks and votes. Not collected: email, phone number, accounts, or contacts.

- IP addresses are never written to the database. They are used only in memory for rate limiting, and the app's own log messages never include them. Vercel keeps its runtime logs only briefly (1 hour on the free Hobby plan, 1 day on Pro).

- Members never see each other's IP addresses: every update travels through Supabase, never directly between phones.

- The host's location is used only to center the search, is never shown to other members (they see distances only), and is deleted when the game ends.

- A daily cleanup job deletes lobbies, members, picks, votes and Google details more than 24 hours old.

- No ad trackers or third-party analytics. If analytics are added later, use a privacy-focused tool that doesn't store IP addresses.

**Website**

- HTTPS only (Vercel's default), plus security headers: a content security policy, no embedding in other sites' frames, a strict referrer policy, and location permission limited to the app itself.

- Rate limits on every server route, keyed by device and IP: for example, lobby creation, join attempts (to stop people guessing codes) and searches.

- Lobby codes are random, use 6 characters without look-alikes (no 0/O or 1/I), and expire after the game or 24 hours.

- The device token is a long random value kept in a secure, HTTP-only cookie, so page scripts can't read it.

- React escapes names and text by default; the app never inserts raw HTML from users or outside APIs.

**Accounts and code**

- Two-factor sign-in on GitHub, Vercel, Supabase, Google Cloud and Ticketmaster.

- .env files are in .gitignore, and a pre-commit secret check (such as gitleaks) blocks commits that contain a key. GitHub's own secret scanning is free on public repositories; on a private repository it may require GitHub's paid Secret Protection.

- Dependabot alerts on, and npm audit checked at every milestone.

Before any public launch, add a short privacy policy (the app uses location) and get a security review from someone besides Claude.

## Build milestones

Each milestone ends with something you can try on your phone. Search uses sample data until milestone 4, so the flow can be tested before the API keys are ready.

1.  **Project setup and design kit**

    - Next.js app set up as a PWA, deployed to Vercel, with the Outfit font and the 2F pieces: main button, pill buttons, chips, code bar, member chips. Security headers, server-only environment settings, the pre-commit secret check and two-factor sign-in on every account. App name "Pickle" in the browser tab and home-screen label. Logo files made from public/logo/pickle-logo.png, the owner's transparent PNG (with its empty margins trimmed), with the browser tab icon, the 180, 192 and 512 px home-screen icons and the link preview image made only by resizing and cropping that file, never redrawing it (see Logo in the product spec).

    - Test: open the link on your phone and add it to your home screen; check the Pickle icon and name appear, the icon isn't cut off on Android, and the logo shows on the home screen with no checkerboard or white box around it.

2.  **Lobby and joining** (screens 01–06, 18, 19)

    - Create a lobby with a code, join with a name, live member chips, duplicate names, leave, remove, host handover, rejoin with the same name. Row-level security on every table, the device-token cookie, input checks and rate limits on create and join.

    - Test: 3 phones join one lobby; close and reopen one; remove one; try 20 wrong codes in a row and confirm you get blocked.

3.  **Host setup and picks** (screens 07–09)

    - Setup options, Yes/No tag picker, waiting screen, cancel-out rule. The lobby locks when the game starts.

    - Test: everyone picks; only who's done is visible, never what they chose.

4.  **Search with real data** (screens 10–11)

    - Google Places and Ticketmaster, filters, duplicate removal, scoring, widening by 5 mi, nothing-found screen, and the API cost rules 1, 2, 4, 6 and 7 (field limits, one broad search, game cache, batched events, quota caps and call log).

    - Test: food, bars and events at different radii; check the 6 options make sense and the call log shows about one Google search per round. Search the browser's page source and network traffic for the API keys and confirm they never appear.

5.  **Option cards** (screen 12)

    - Card with up to 3 photos (loaded lazily, API cost rule 3), details and link; arrows and swiping; Go vote unlocks after every card is seen. Cards with Google data show the required "Google Maps" attribution, the photo author's credit and a link to the place on Google Maps.

    - Test: try to vote before seeing all cards.

6.  **Voting and rounds** (screens 13–15)

    - Drag to rank, points, tie-breaks, round complete, 2–3 rounds with all-new options, final vote.

    - Test: a 2-round game with 3 people, including a forced tie.

7.  **Results and replay** (screens 16–17)

    - Top 3, directions in Apple or Google Maps, web search link, Change lobby moving everyone to a new code. Results with Google data show the same "Google Maps" attribution and photo credit as the cards.

    - Test: full game end to end, then start a second game.

8.  **Demo mode**

    - Add demo friends button; simulated members pick and vote a few seconds after you. Record the saved sample search (food, bars and events) at your real demo location, so demo games show local places without calling the APIs.

    - Test: run a whole game alone on one phone.

9.  **Polish and demo prep**

    - Loading and error states, join errors (screen 04), spending caps checked, speed on a slow connection. Daily cleanup job, a check that no log message contains IP addresses or keys, and a pass through the Security and privacy checklist.

    - Test: a real game with friends, then rehearse the demo.

## Accounts and keys

You create these accounts yourself; set aside 30–60 minutes. Only the first three are needed to start; the API keys can wait until milestone 4.

| Account                | Used for                                            | Needed by       | Notes                                                                        |
|------------------------|-----------------------------------------------------|-----------------|------------------------------------------------------------------------------|
| GitHub                 | Storing the code                                    | Milestone 1     | Free                                                                         |
| Vercel                 | Hosting the website                                 | Milestone 1     | Free tier; connect it to the GitHub repo                                     |
| Supabase               | Database, real-time lobbies                         | Milestone 2     | Free tier                                                                    |
| Google Cloud           | Places API key (restaurants, bars)                  | Milestone 4     | Requires billing; set a budget alert and a daily quota cap before going live |
| Ticketmaster Developer | Events API key                                      | Milestone 4     | Free developer key; 5,000 calls a day, 5 a second                            |
| Domain name (optional) | A short link for Pickle (pick one that's available) | Before the demo | Any registrar; Vercel connects it                                            |

Keys go into Vercel's environment settings, never into the code or a chat message.

## How we work

Claude writes the code one milestone at a time; you review it and test it on your phone before the next one starts.

1.  Connect the GitHub repo so Claude can work in it (Claude Code works directly in the repo).

2.  Start each milestone by pointing Claude at the copies of this plan and the product spec in the project folder, and at the screen images the milestone covers (see Project folder setup below).

3.  Claude builds it on its own branch and opens a pull request with a short summary and a test checklist.

4.  Vercel creates a preview link for every pull request. Test on your phone using the milestone's test step.

5.  Report anything that looks or works wrong; Claude fixes it on the same branch.

6.  When it passes, merge the pull request and move to the next milestone.

Keep the spec current: if a decision changes during the build, update the product spec first so later milestones follow it.

**Project folder setup (before milestone 1)**

Claude Code works from files in the project folder and usually can't open private claude.ai links, so put copies of everything it needs there:

| File                        | What it is                                                     |
|-----------------------------|----------------------------------------------------------------|
| docs/product-spec.md        | This product spec, exported as Markdown                        |
| docs/build-plan.md          | This build plan, exported as Markdown                          |
| docs/screens/               | One image per screen (01–19), exported from the screens canvas |
| public/logo/pickle-logo.png | The original transparent logo PNG                              |

The Markdown export replaces the two diagrams (game flow and architecture) with placeholders; the text around them describes the same thing. If a decision changes, update the claude.ai doc first, then re-export it into the folder.

## Risks to watch

| Risk                                                                    | What to do                                                                                                                                          |
|-------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| Google Places costs grow with testing                                   | Fetch details only for the final 6, cache results during a game, keep the budget alert and quota cap on                                             |
| Thin results in small towns or on quiet nights                          | The 5 mi widening and the nothing-found screen cover this; test at your real demo location                                                          |
| Event and venue data is incomplete (photos, age limits, indoor/outdoor) | Show placeholders when photos are missing; treat age and indoor/outdoor as best effort, as the spec says                                            |
| A phone drops mid-game                                                  | Rejoin with the saved token and name; the host can remove someone who is stuck                                                                      |
| Demo-day surprises (bad signal, API outage)                             | Demo mode plus a saved sample search let the demo run even if a live search fails                                                                   |
| Breaking Google's display and storage rules                             | Show "Google Maps" attribution and photo credits on cards and results; keep only place IDs after a game ends; check the service terms before launch |
| The name Pickle is already used by another app or company               | Fine for a demo; before a public launch, run a trademark search and check the app stores and domains                                                |
