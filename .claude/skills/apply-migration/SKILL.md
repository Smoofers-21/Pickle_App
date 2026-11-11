---
name: apply-migration
description: Apply a new SQL migration to the hosted Supabase project for Pickle safely, then verify it (grants, security advisor, read-only security audit, exact match with the file) and record it. Use whenever a supabase/migrations file needs to reach the live database. Requires the owner's explicit OK every time.
---

# Apply a migration to hosted Supabase

Project: `gcjnqdlzkjxrhlxkhmyz` (Pickle_app). Tools: Supabase MCP
(`apply_migration`, `execute_sql`, `get_advisors`).

## Before

1. **The file is final and tested.** It is new (never edit an applied
   migration), and `npm run check:sql` passes with it.
2. **Coordinate.** `supabase/migrations` is a shared contract: make sure your
   task's claim covers it (`agent-coord.mjs read`).
3. **Check it matches the live schema.** Read the objects it changes with
   read-only `execute_sql`: constraint names, function signatures it drops or
   replaces, columns it adds. A `drop function` with the wrong signature fails.
4. **Order with the code.** If it removes or renames anything the deployed
   code calls (functions, columns), say which previews or production code will
   break and apply it only alongside the matching code. Production (`main`)
   must keep working.
5. **Ask the owner** in one message: the file, what it changes, whether it
   deletes data, and what breaks until the matching code is deployed. Wait for
   an explicit yes. Approval covers this migration only.

## Apply

6. `apply_migration` with a snake_case name and the file's SQL **exactly**,
   including comments inside function bodies. Leave out only a top-level
   `begin;` / `commit;`: the tool runs in its own transaction.

## Verify (all read-only)

7. **Grants:** for every function and table the migration adds or replaces,
   `anon` and `authenticated` have no access and `service_role` does:
   `has_function_privilege(...)` / `has_table_privilege(...)`.
8. **Security advisor:** `get_advisors type=security`. Expected:
   `rls_enabled_no_policy` INFO only (tables are locked on purpose). Anything
   else: stop and report.
9. **Security audit:** run the body of `supabase/security-audit.sql` (the `do`
   block, without its `begin read only` / `rollback`), then
   `select 'PASS' as audit;`. Update the audit's expected functions in the
   same PR when the migration adds new ones.
10. **Exact match:** compare `md5(prosrc)` of each function the migration
    defines, live versus a local database built by `npm run check:sql` (or a
    fresh local build of all migrations). Any difference means the live copy
    isn't the file: re-create it from the file.

## Record

11. `supabase/README.md`: add the file to the table and mark it applied, with
    the date.
12. Commit, push, and tell the owner what was applied, what the checks
    showed, and what to test.
13. Post an update on the coordination channel
    (`agent-coord.mjs post --type update --task <task>`), naming the migration.

Never run `supabase/tests/*` or `local-stubs.sql` on the hosted project, and
never put keys or member data in messages.
