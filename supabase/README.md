# Database (Supabase)

`migrations/` holds the database setup, one file per change, in date order.

## Applying a migration

Supabase dashboard → **SQL Editor** → **New query** → paste the whole file → **Run**. Run each file once, in order. All files below have been applied to the Pickle_app project (as of Nov 11, 2026); the worker-fencing migration was applied after review, and `security-audit.sql` passed against the hosted project.

| File | Milestone | What it does |
|---|---|---|
| `20261108000001_initial_schema.sql` | 2 | All tables locked down (RLS on, no browser access), lobby functions, live-update pings |
| `20261110000001_game_setup_and_picks.sql` | 3 | Start a game (locks the lobby), Yes/No picks, demo friends, pings for games and picks |
| `20261110000002_lock_down_rls_auto_enable.sql` | 3 | Stops browser roles calling Supabase's own `rls_auto_enable()` (security advisor warning) |
| `20261110000003_unready_picks.sql` | 3 | "Change my picks" takes you out of "done" until you submit again |
| `20261110000004_serialize_picks_advance.sql` | 3 | Locks the game before counting who's done, so leaving/removal and "Change my picks" can't race (security review, Codex) |
| `20261110000005_no_rejoin_by_name.sql` | 3 | A name never reclaims someone's spot: only the phone that owns it can (security review) |
| `20261111000001_geoapify_option_source.sql` | 4 preparation | Lets saved options come from Geoapify; keeps the old Google value for existing rows (security review, Codex) |
| `20261111000002_search.sql` | 4 | Search: time zone and progress on games, card details on options, the daily API budget and call log (`api_usage`), and the functions to claim, save and finish a search, change the criteria and end a game |
| `20261111000003_fence_search_workers.sql` | 4 security review | Token-based search ownership, guarded credit reservation and consistent lobby/game lock order (security review, Codex) |
| `20261112000001_voting.sql` | 6 | Rankings (`votes.ready`, submit / change), points and places in `round_results` with tie-breaks, round complete, next round and final vote; leaving or removal can end a round. Applied to hosted Supabase Nov 12, 2026 (grants, advisor, audit and function hashes checked) |
| `20261112000002_change_criteria_clears_votes.sql` | 6 review | Changing the criteria (which restarts at round 1) also deletes earlier rankings and round results, so old "done" rankings can't count in the new round. Applied to hosted Supabase Nov 12, 2026 (grants, advisor, audit and function hash checked) |
| `20261112000003_shared_result_places.sql` | 6 review (Codex) | In the deciding vote, options still tied on points and 1st places share their place (1st, 1st, 3rd); random tie-breaks stay only for choosing each round's top 2. Applied to hosted Supabase Nov 12, 2026 (grants, advisor, audit and function hash checked) |
| `20261112000004_optional_no_pick.sql` | 6 (owner) | Both picks are optional: `picks.no_tag` may be empty; "Other" text still only goes with an "other" No. Applied to hosted Supabase Nov 12, 2026 (constraint matches the file, picks still locked to browsers, advisor and audit checked) |
| `20261113000001_change_lobby.sql` | 7 | Change lobby: `change_lobby` moves the active members to a new code (same order and host), deletes the finished game and ends the old lobby; `moved_lobby_code` sends a phone on the old code to the new one only if it's a member there. Applied to hosted Supabase Nov 13, 2026 (grants, advisor, audit and function hash checked) |

Apply `20261111000003_fence_search_workers.sql` before deploying this branch.
It replaces the search worker RPC signatures and reloads PostgREST's schema
cache. Old workers without a valid token are rejected. Deploy the matching
application code immediately afterward; in-flight searches may wait for their
45-second stale-claim timeout before recovery. Do not roll back just the
application to an unfenced worker implementation.

For a **read-only** deployed-schema/security check after migration, run
`supabase/security-audit.sql` in the SQL editor, or use
`psql -v ON_ERROR_STOP=1 -f supabase/security-audit.sql` with an appropriately
authorized database connection. It checks catalogs and grants without reading
member data or locations. A local pass does not establish deployed readiness.
Never run `tests/local-stubs.sql` on hosted Supabase.

## Testing locally

Shortcut: `npm run check:sql` (or `npm run check:all` for every check).

The tests run on plain Postgres 16 (CI does this on every push):

```bash
createdb pickle_test
psql -d pickle_test -f supabase/tests/local-stubs.sql
for f in supabase/migrations/*.sql; do psql -d pickle_test -f "$f"; done
for f in supabase/tests/*_test.sql; do psql -d pickle_test -f "$f"; done
```

`local-stubs.sql` creates stand-ins for Supabase's roles and `realtime.send`. Never run it on Supabase.
