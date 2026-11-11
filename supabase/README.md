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

The tests run on plain Postgres 16 (CI does this on every push):

```bash
createdb pickle_test
psql -d pickle_test -f supabase/tests/local-stubs.sql
for f in supabase/migrations/*.sql; do psql -d pickle_test -f "$f"; done
for f in supabase/tests/*_test.sql; do psql -d pickle_test -f "$f"; done
```

`local-stubs.sql` creates stand-ins for Supabase's roles and `realtime.send`. Never run it on Supabase.
