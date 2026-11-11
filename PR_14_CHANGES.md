# PR #14: search security fixes and Vercel Web Analytics

[PR #14](https://github.com/Smoofers-21/Pickle_App/pull/14) is open.
Branch: `security/pr-13-review`, based on PR #13 at `767604b`.
Search implementation commit: `5ed3b16`. The earlier API attempt was blocked;
after the environment update, GitHub access was verified and the existing open
PR was found. Analytics is added to that same branch and PR.

- Bound provider response bodies by streamed bytes and enforce body-read deadlines.
- Fence search workers with private claim tokens, including credit reservation, cache writes, progress and completion.
- Serialize worker/host changes with consistent database locks; reject expired/ended searches and invalid chosen options.
- Correct provider pagination, exclude departed members' picks and prevent repeat chains across rounds.
- Validate provider numbers, nested event responses, calendar dates, clock fields and credential-bearing links.
- Run explicit demo searches on saved samples, with a clear sample label and no API quota usage.
- Add provider, setup, search and database regressions, plus a read-only deployed-schema security audit.
- Add the official Vercel Web Analytics integration once in the server root layout,
  collecting only on Vercel production. Redact lobby codes and strip query strings,
  fragments and URL credentials; drop unreviewed routes and custom events.

**Validation:** current lint, type checking, 118 unit tests, production build,
browser bundle check and dependency audit pass (zero known advisories). Analytics
browser checks pass with a collector substitute, including CSP and blocked-script
behavior. The earlier search review passed 132 SQL checks and local Supabase
SDK/PostgREST/app integration checks; database tests were not rerun for this
analytics-only addition. The sole added package is `@vercel/analytics@2.0.1`;
existing package versions and GitHub Actions are unchanged.

**Deployment:** apply `supabase/migrations/20261111000003_fence_search_workers.sql` before deploying the matching code, then run `supabase/security-audit.sql` read-only against the hosted project. The security migration rejects old worker calls; do not deploy an old worker afterward. No hosted changes were made here.

**Vercel setup:** enable Web Analytics in the project's Analytics tab, then deploy
to production. No analytics API key is needed. Previews intentionally do not
collect traffic. See [VERCEL_ANALYTICS.md](VERCEL_ANALYTICS.md) for the complete
integration, privacy decisions, verification and dashboard steps.

**Access limitation:** GitHub API access now works and PR #14 is confirmed open.
Hosted Supabase remains unverified; no Supabase secret bindings are configured
here. No hosted migration, application deployment or live analytics ingestion
test was performed. Local verification does not establish hosted readiness.

See [PR_13_SECURITY_REVIEW.md](PR_13_SECURITY_REVIEW.md) for findings, reproductions, validation details and remaining limitations.
