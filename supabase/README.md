# Database (Supabase)

`migrations/` holds the database setup, one file per change, in date order.

## Applying a migration

Supabase dashboard → **SQL Editor** → **New query** → paste the whole file → **Run**. Run each file once, in order. The pull request for each milestone says which new files to run.

| File | Milestone | What it does |
|---|---|---|
| `20261108000001_initial_schema.sql` | 2 | All tables locked down (RLS on, no browser access), lobby functions, live-update pings |
| `20261110000001_game_setup_and_picks.sql` | 3 | Start a game (locks the lobby), Yes/No picks, demo friends, pings for games and picks |

## Testing locally

The tests run on plain Postgres 16 (CI does this on every push):

```bash
createdb pickle_test
psql -d pickle_test -f supabase/tests/local-stubs.sql
for f in supabase/migrations/*.sql; do psql -d pickle_test -f "$f"; done
for f in supabase/tests/*_test.sql; do psql -d pickle_test -f "$f"; done
```

`local-stubs.sql` creates stand-ins for Supabase's roles and `realtime.send`. Never run it on Supabase.
