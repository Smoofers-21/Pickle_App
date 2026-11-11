# PR #11 review: Geoapify preparation

Reviewed PR head `16ecb7d63b10a1297af0e1d69a7beb83acd44f8d` against `main` (`717018d`). Work is on `security/pr-11-review`. This root file is the handoff for Claude and records the fixes and remaining limits. No app screens, matching weights, lobby flow, GitHub Actions, dependencies, or live provider integration are being added or changed. Review changes are prepared for publication to GitHub at the user's request. Publishing the branch does not merge the PR or deploy code or migrations.

## Findings and fixes

1. **Database compatibility:** the existing options source constraint accepts only `google` and `ticketmaster`, while the new Candidate type emits `geoapify`. Add a new migration and local SQL regression test so Geoapify results can be cached. Preserve legacy Google rows instead of relabeling or deleting historical data; the unused rating column is retained. Existing migration files are not edited. Hosted Supabase is not modified by this review.
2. **Image processing correctness and filesystem safety:** reject ambiguous output names before processing (for example `Italian.png` and `italian.jpg`), invalid URL filenames, and symlinked image inputs/outputs. Report errors other than a missing originals folder. Sort inputs and publish files through temporary files so a failed encoding cannot truncate an existing output or the generated manifest. Keep the documented `npm run images` workflow, crop, JPEG quality, and metadata stripping.
3. **Secret-check output:** the bundle checker could print a matched short/punctuated secret value in its diagnostic. Label secret matches separately from their actual values, retain legacy Google-key scanning, scan source maps, and reject an empty scan. Add regression tests using synthetic markers, never real credentials.

## Provider contract and security limits

This PR prepares Geoapify; it contains no PlacesProvider implementation, live HTTP request, opening-hours parser, shared credit limiter, or search/cache orchestration. Those remain milestone 4. No live search can be signed off here. The supplied handoff's category, response-field, credit-cost, attribution, and caching statements remain provisional: this environment's request to the official Places documentation was denied by network policy. Geoapify credentials are not injected into this environment (a Vercel key does not automatically appear here).

The adapter must normalize verified Geoapify categories and raw OSM tags into the internal cuisine/bar tokens expected by scoring and cuisineImage. Split semicolon cuisine values, interpret diet values (`no` must not become a vegetarian match), and handle missing tags/hours as unknown. Raw dotted API categories must not be passed through as though they were already normalized tokens. Do not invent a category/field mapping without fixtures from the API. Keep distanceMax=20 and threshold=60 as the owner's selected policy; tune only with representative live results.

Before shipping milestone 4, verify plan credit pricing for the actual page size, including retries and pagination, and reserve budget atomically in shared storage before outbound requests. Counting requests alone is not a credit budget. Keep URL query keys, precise locations, and raw provider error bodies out of logs. Use a fixed HTTPS API host, bounded timeouts/results, and existing server-only key access. Check attribution/caching terms against official sources. Restrict server keys only using controls supported by the actual Vercel deployment; browser referrer restrictions are not proof of server identity.

The previously reviewed name-takeover issue is fixed on this PR's base by `20261110000005_no_rejoin_by_name.sql`; do not restore name-based recovery. Public Realtime channel/presence trust, process-local IP limits, and planned cleanup/retention remain existing limitations, not guarantees supplied by this provider change.

## Validation

Baseline: all 39 existing unit tests passed; full dependency audit reported zero known advisories. Nine added regression cases failed before their fixes (five image safety/correctness cases and four bundle-check cases). The Geoapify SQL insert also failed against the original constraint and passed after the additive migration.

Final validation:

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run check:bundle`: passed. There are 51 unit tests: 39 existing plus 12 added (7 image processor and 5 bundle checker tests).
- New tests: `src/lib/game/process-cuisine-images.test.ts` runs the real CLI against temporary fixtures, checking collisions, symlinks, invalid filenames, directory errors, failed-encoding preservation, JPEG dimensions/metadata and repeatability. `src/lib/server/security-scripts.test.ts` runs the real bundle checker against temporary browser assets and synthetic secret markers. No real credentials are used in tests.
- Fresh local Postgres 16 database: stubs, all migrations in order, then every SQL suite passed (78 notices/checks, including the two new provider checks). `supabase/tests/provider_test.sql` verifies Geoapify/Ticketmaster/legacy source acceptance and unknown-source rejection; fixture changes roll back. Existing browser-role/RLS and no-name-takeover regressions passed.
- `npm run images`: passed with no originals and zero library photos, preserving the existing generated manifest content. Tests separately verify real image processing produces 1200×800 JPEG without EXIF metadata and preserves existing output on corrupt input.
- Production browser checks: home, design kit, create and join returned HTTP 200 with expected content and CSP; navigation and malformed-Origin rejection worked, with no browser page errors.
- The Next config guard rejected a synthetic `NEXT_PUBLIC_GEOAPIFY_API_KEY` misconfiguration before building. No secret values were printed.
- Full `npm audit --json`: zero reported vulnerabilities across production and development dependencies. Gitleaks v8.18.4 found no leaks in 20 reachable commits or in a source snapshot containing all tracked/nonignored working files. Ignored local/build artifacts were not part of the source scan.
- PR head was rechecked after validation and remained `16ecb7d63b10a1297af0e1d69a7beb83acd44f8d`. `git diff --check` passed. Workflow and dependency files match the reviewed PR exactly.

Documentation changes: `supabase/README.md` lists the new migration and its unapplied hosted status; `public/images/restaurants/README.md` explains CLI validation and metadata removal; `docs/build-plan.md` removes the one-request/one-credit assumption and requires shared, atomic accounting before live integration; `README.md` now distinguishes completed features from planned live search/cards/voting and the empty image library.

No claim of vulnerability-free code or live Supabase/Geoapify readiness is made. The new migration is `supabase/migrations/20261111000001_geoapify_option_source.sql`; apply it through the existing deployment process before caching Geoapify results. Neither that hosted migration nor official API/terms verification was performed here.
