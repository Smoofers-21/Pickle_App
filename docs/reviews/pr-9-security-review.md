# PR #9 security review and optimization

Reviewed PR head `34c7b7217e68e6f0160d6c8464d3181e2515ff3e` against `origin/main` on November 10, 2026. Review changes are on `security/pr-9-review`, prepared for publication to GitHub at the user's request. Publishing this branch does not deploy these changes.

## Scope and workflow

Review covers API authorization/input handling, database grants/RLS and transitions, device cookies, browser exposure, dependency advisories, and scoring. Existing app screens, rejoin rules, API success shapes, scoring rules, dependencies, and GitHub Actions workflow are preserved. This root document records every added file and behavior change for Claude.

## Findings and changes

- **Medium, inherited: request size enforcement.** `src/lib/server/api.ts` previously buffered the entire body before checking JavaScript string length. Oversized/chunked requests could consume memory and multibyte text bypassed the advertised 2,048-byte cap. Read incrementally, cancel oversized streams, and enforce actual bytes before parsing. Normal requests keep their existing responses.
- **Low, inherited: malformed origins and log disclosure.** Invalid Origin headers could throw outside the error boundary. Reject invalid/non-HTTP origins with 403. Log only an error class, not arbitrary upstream messages that could contain sensitive details.
- **Resource optimization, inherited:** reject IP-limited requests before making a database rate-limit RPC. Keep both limits for allowed traffic.
- **Medium, PR correctness race (fixed):** removing/leaving members could read the previously committed ready count while another transaction was unreadying a member, then wait for the game row and advance using the stale count. The added migration `supabase/migrations/20261110000004_serialize_picks_advance.sql` takes the game-row lock before counting. Existing function grants are preserved. Apply this migration after the PR's existing migrations using the normal deployment process; only the local test databases have been migrated. `supabase/README.md` lists it. No existing migrations or CI workflows were edited.
- **Scoring optimization:** normalize each candidate once per scoring call, instead of once for every Yes/No entry. Keep matching weights, tie ordering, and exported APIs unchanged.

## Remaining security decisions (not silently changed)

- **High impact, inherited account/session takeover by design:** `join_lobby` accepts an offline member's name and lobby code as enough evidence to transfer their device binding after 75 seconds (or after leaving). A lobby participant can learn the host's name, wait until they are offline, then rejoin as that host and gain host permissions and their saved picks. PR #9 preserves this behavior and prevents takeover only of demo members. A secure fix needs proof of ownership (for example a recovery token or approval from the original device) and changes the documented rejoin workflow. Do not treat a display name as authentication. This remains unresolved under the requested workflow constraint.
- The public Realtime channel uses an unguessable lobby UUID, not authenticated membership. Anyone who learns it can spoof presence or change pings, or observe presence after removal. Picks and secrets are not broadcast. Private membership-authorized channels would require a Realtime/auth workflow decision.
- Per-IP enforcement assumes the deployment overwrites trusted proxy headers. It is process-local; it is not a globally shared abuse limit. Device cookies can be rotated by an attacker. Confirm ingress behavior on the deployed platform before treating these limits as strong abuse prevention.
- Expired rate-limit rows and stored location data have no implemented cleanup job yet (planned milestone 9). Retention and sustained table growth remain deployment concerns.

## Validation

Full dependency audit at PR head: zero reported advisories (production and development). This is a point-in-time result, not proof that no vulnerabilities exist. Live Supabase credentials/network access are unavailable; local Postgres stand-ins cannot validate deployed grants, Realtime configuration, or platform ingress behavior.

Added `src/lib/server/api.test.ts` (malformed/cross-site origins, exact byte boundary, multibyte oversized body, stream cancellation, malformed JSON, and sensitive error logging) and `src/lib/server/rate-limit.test.ts` (IP short circuit and device denial). The existing Vitest runner discovers both; no runner/dependency changes. Six API regression cases failed on the original code and passed after the fixes. Added `supabase/tests/security_test.sql`, discovered by existing CI, to verify all nine app tables force RLS and deny browser grants and that app RPCs deny both browser roles while allowing service_role.

- `npm run lint`, `npm run typecheck`, `npm test`: passed, 33 tests (22 existing scoring tests and 11 new API/rate-limit tests).
- Fresh Postgres 16 database, local stubs, every migration in order, then every `supabase/tests/*_test.sql`: passed, 72 existing assertions plus two security matrix checks.
- Real two-session Postgres concurrency reproduction: before fix, `stage=searching` while host `ready=false`; after fix, `stage=picks` and `ready=false`.
- Name-based host takeover confirmed in a rolled-back local transaction: after making the host stale for 76 seconds, joining with the host name and a different device returned `rejoined=true`, with the new device bound to the host. This is an unresolved product security decision, not a safe authentication mechanism.
- Full `npm audit --json`: zero known advisories. Gitleaks v8.18.4 scanned 14 reachable commits with no detected leaks; this scans Git history, not ignored environment files. `npm run check:secrets` passed but checks staged additions (there were none), so it does not substitute for the history scan or code review.
- `npm run build` and `npm run check:bundle`: passed. No forbidden server-only names, endpoints, or available secret values were detected in browser assets.
- Production server browser smoke tests: home, design kit, create, and join pages returned HTTP 200 with expected content and no browser errors; malformed and cross-site Origin requests returned the expected 403.
- Gitleaks on a snapshot of all tracked and nonignored working files (including these fixes/tests/documentation): no leaks. A separate scan including generated/ignored artifacts reported eight matches, all in Next.js-generated draft/preview properties under `.next` (`cache/.previewinfo`, development/production `server/preview-props.json`, and `prerender-manifest.json`). These are server build artifacts, ignored by Git; keep them out of source control and public static hosting. They were not suppressed by adding scanner exclusions.
- PR head was rechecked after validation and remained `34c7b7217e68e6f0160d6c8464d3181e2515ff3e`. Dependency files and `.github` match that PR head exactly. `git diff --check` passed.

### Reproducing the concurrency regression

Use a disposable local database with the stubs and migrations. Create a lobby with Host, Ana, and Ben. Start a game and submit picks for Host and Ana, leaving Ben unfinished. In session A: `BEGIN; SELECT public.unready_picks(game_id, host_id);` and keep the transaction open. In session B: `SELECT public.remove_member(lobby_id, host_id, ben_id);`. Wait until B is blocked on a row lock (visible in `pg_stat_activity`), then `COMMIT` A. After B finishes, assert that the game is still at `picks` and Host's picks have `ready=false`. Before the new migration the game incorrectly became `searching`. Leaving Ben's member instead of removing it uses the same advance function.

Publishing the review branch does not merge PR #9 or apply fixes to hosted services. The new SQL migration still needs the normal deployment process. GitHub's PR metadata API was forbidden in this environment; the PR was fetched directly through `refs/pull/9/head`, so review is against the exact Git commit recorded above, not an assumed branch tip. Live Supabase and multi-phone Realtime testing remain unrun.
