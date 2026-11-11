# PR #13 security review and fixes

Review target: PR #13 at `767604b134516ec134cd7ff39bde3436d06553a4`, based on `main` at `24dff8a`. Fix branch: `security/pr-13-review`. This root document is the handoff for Claude and the owner; it records findings, changes, database deployment requirements and validation. The intended follow-up PR number is assigned by GitHub, not by this branch.

## Review scope

Provider HTTP boundaries, untrusted response parsing, cache/pagination and scoring correctness, search claims and stale workers, host-only mutations, database permissions/RLS, location and key exposure, setup validation, and browser regressions. Preserve the existing user flow, dependencies and GitHub Actions. Add fixes through an additive migration rather than editing migrations already reported applied to hosted Supabase.

## Findings fixed

- Provider response limits were enforced after buffering the whole response; streamed/chunked bodies could exceed the intended memory cap and escape safe error classification.
- Search claims had no ownership token. A worker surviving a takeover or criteria reset could save results, report progress or finish a newer search with stale data. Fencing must cover database writes and budget reservations.
- Pagination advanced by the number of valid candidates rather than raw consumed provider results, repeating pages when invalid results were dropped.
- Search preferences included ready picks from members who had left or been removed; chain deduplication across rounds only remembered provider IDs.
- Numeric coercion treated null coordinates/distances as zero, invalid nested event arrays could fail an entire response, and event date validation accepted normalized impossible dates.
- Opening-hours parsing accepted invalid clock components and ignored holiday exceptions despite having no holiday calendar.
- Demo lobbies used live providers despite the documented saved-sample rule, consuming the real shared quota. They now use server-only saved fixtures and label the results as demonstration data.

The most significant issues are worker ownership/integrity and response resource limits. No browser-to-service-role privilege escalation or exposed application credential was found in the reviewed changes; this is not a guarantee that no vulnerability exists.

## Implementation

- `providers.ts`: counts streamed bytes before decoding, cancels oversized bodies without waiting for EOF, enforces a deadline during response-body reads, and translates failures into safe error labels. HTTP-error cancellation cannot stall the worker. Fixed HTTPS hosts, redirect refusal, server-only keys, and the two-call round limit remain.
- `20261111000003_fence_search_workers.sql`: issues a private UUID per claim; rejects stale/tokenless cache writes, progress, finishes and credit reservations; rejects expired/ended games; uses a lobby-then-game lock order for worker writes and criteria changes; validates that selected options belong to the current game; revokes browser EXECUTE grants transactionally and reloads PostgREST. Existing applied migration files are untouched.
- `search.ts`: sends the claim token on every mutation, stops stale workers, filters preferences to active members captured at claim time, remembers shown chain names across rounds, advances pagination by raw consumed results, and avoids logging provider error messages.
- Provider parsers reject invalid coordinates/distances and impossible dates, tolerate malformed per-event classification arrays, reject credential-bearing links, and avoid inherited object properties when creating kind labels. Candidate filtering also rejects nonfinite/negative distances.
- Opening-hours parsing validates clock components and returns unknown for holiday-dependent expressions because no holiday calendar is available. Unknown hours retain a place rather than falsely claiming it is open or closed.
- `demo-search.ts` uses saved samples without network calls or budget reservations; the existing options screen explicitly labels sample results. No user flow, dependencies or CI workflow was changed. Scoring weights remain unchanged.

## Evidence and validation

- Baseline: 84 existing unit tests passed; all seven new provider-boundary regressions failed on the original code (oversize, multibyte, stream errors/deadlines, HTTP cancellation, raw-page consumption and malformed event handling).
- A separate database with the original PR #13 migrations reproduced an old worker successfully finishing a replacement search. The additive migration rejects that operation and the other stale mutations.
- Final lint, type checking, 103 unit tests, production build, browser bundle check and whitespace check passed.
- Fresh schema creation and upgrade from the original PR #13 schema were tested on Postgres 16. The existing 116 SQL checks and 16 new fencing checks pass (132 total). The separate read-only `supabase/security-audit.sql` passes locally and covers required columns/RPC signatures, Geoapify source compatibility, forced RLS, browser grants, service-role access and removal of unfenced overloads.
- Actual Supabase JS SDK against a local PostgREST 13.0.4 instance: service-role RPC succeeds; anonymous table access and anonymous search RPC are denied.
- App-to-REST-to-database end-to-end test: create lobby, add demo friends, start game, submit picks and show six sample options without spending API quota. Public JSON excluded claim tokens, device hashes, hidden scores and stored search coordinates. Final stored host coordinates were cleared. A missing real-provider key failed safely and cleared coordinates. A non-host could not end a game; the host ended it and reopened the lobby.
- Production browser rendering/navigation had no page errors. Local HTTP testing used synthetic fixture identities and relaxed their Secure cookie flag only in the harness; application cookies retain their production Secure/HttpOnly settings. No real key, production identity, remote database or provider endpoint was used for these integration tests.
- Full dependency audit reported zero known production/development advisories. Gitleaks v8.18.4 found no leaks in the 25 reachable commits reviewed before the fix commit or in a snapshot of all tracked/nonignored working files including the fixes. Staged additions also pass the repository's pre-commit secret check. Ignored build outputs and ephemeral local harness credentials were not part of the source snapshot.

## Deployment and remaining limits

Apply `supabase/migrations/20261111000003_fence_search_workers.sql` through the normal migration process before deploying the matching application branch. It changes RPC signatures; legacy worker writes are deliberately rejected. Deploy the application immediately afterward and allow up to the 45-second stale-claim timeout for abandoned work. A code-only rollback to the old worker is not compatible with this security migration.

Run `supabase/security-audit.sql` against hosted Supabase afterward using the SQL editor or an authorized database connection. It is read-only and inspects schema/permission metadata, not member data. Never run local stubs or fixture suites on production. These files have only been exercised locally; the handoff's assertion that prior migrations were applied was not independently verified on the live project.

Live Geoapify/Ticketmaster responses, pricing, throughput and terms were not revalidated: provider keys are absent here. Existing app-level daily budgets are not a guarantee about other applications using the same provider account, nor a provider-wide requests-per-second limiter. Supabase Realtime public-channel presence/spoofing, production ingress-header trust and eventual cleanup/retention remain existing operational concerns; local database tests do not certify the hosted Realtime/gateway configuration.

## Supabase and publication access

The cloud process initially had no Supabase URL/key bindings or local env files, no Supabase connector, and a request to the project host was denied by network policy. The integration harness used only an ephemeral local test key. Vercel settings are a separate environment. Local Postgres/PostgREST validation cannot establish that hosted Supabase has the same schema or configuration. No live database writes or deployments were performed.

Git push succeeded: the implementation is commit `5ed3b16` on `security/pr-13-review`. The explicit `gh pr create` attempt failed with `Post https://api.github.com/graphql: Forbidden`; no follow-up PR was created or assigned a number. A fresh HTTPS request also received a proxy CONNECT 403. An additive `api.github.com` domain request was saved to the existing environment draft, preserving the existing Supabase destination, but the runtime still reports revision 1 without that access. Review/save the draft and publish the environment configuration as appropriate; saving the proposal alone did not apply it. Once access is available, retry creation against `main` with this branch and the change summary.

The fix branch includes PR #13's commits and can be proposed against `main` as the corrected replacement/follow-up. No branch is merged and no application or hosted migration is deployed by publication.
