---
name: check-all
description: Run every check in the Pickle repo (secret check, lint, typecheck, unit tests, build, browser-bundle key check, all SQL migrations and tests on a fresh local Postgres, whitespace) with one command. Use before every commit or push, before saying work is done, and when reviewing another agent's branch.
---

# Run every check

```bash
npm run check:all
```

`scripts/check-all.sh` runs, in CI order, and stops at the first failure with
its output:

| Step | Command |
|---|---|
| secret check | `npm run check:secrets` |
| lint | `npm run lint` |
| typecheck | `npm run typecheck` (generates route types first) |
| unit tests | `npm test` |
| build | `npm run build` |
| bundle check | `npm run check:bundle` (no key names, values or API hosts in browser code; needs the build) |
| SQL tests | `npm run check:sql`: stubs, every migration in order, every `supabase/tests/*_test.sql`, on a throwaway local database |
| whitespace | `git diff --check HEAD` |

## Notes

- **Postgres:** `check:sql` starts the local server if it stopped (it does in
  this cloud container), creates a throwaway `pickle_check_<pid>` database and
  drops it afterwards. With `PGHOST`/`PGUSER` set it uses those, like CI.
- **Never** run the SQL tests, or `supabase/tests/local-stubs.sql`, against the
  hosted Supabase project. For the live database use `/apply-migration`, which
  runs only read-only checks there.
- **A new dependency** (package.json changed): run `npm ci` first.
- **Reporting:** quote the summary lines (test and SQL check counts) in the PR
  or handoff. If a step fails, fix the cause; never skip or disable a test to
  get green.
- **Coordination:** include the summary in `agent-coord.mjs handoff --checks`.
