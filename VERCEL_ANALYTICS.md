# Vercel Web Analytics handoff

Included in [PR #14](https://github.com/Smoofers-21/Pickle_App/pull/14) on
`security/pr-13-review`. This documents the addition for Claude and the owner.

## Integration and performance

- Installed the official `@vercel/analytics` Next.js integration, pinned to
  `2.0.1` with npm and an integrity-checked `package-lock.json`. This was the
  registry's current stable release when installed. No existing package versions
  changed; npm also refreshed existing optional dependency development flags.
- The server root layout mounts `WebAnalytics` once, after the page children,
  only when `VERCEL_ENV === "production"`. Vercel supplies this system variable.
  Preview deployments, ordinary local builds and development do not mount it.
  Keep Vercel's automatic system-environment-variable exposure enabled.
- A small client component imports `Analytics` from `@vercel/analytics/next`.
  The layout remains a server component. The SDK handles routing, Suspense and
  duplicate script prevention; its collector script is deferred and uses the
  same-origin `/_vercel/insights/script.js` endpoint in production. No extra
  polling, manual script injection, custom events or Speed Insights were added.

## Security and privacy decisions

- `src/lib/analytics.ts` supplies the SDK's `beforeSend` hook. It permits
  pageviews for `/`, `/new`, `/join`, `/join/[code]` and `/lobby/[code]` only.
  Actual lobby codes become the literal `[code]` placeholder. Query strings,
  fragments and URL credentials are removed. Unknown routes (including `/kit`
  and API URLs), invalid URLs and custom events are dropped. Review the allowlist
  when adding routes or custom event tracking.
- No names, picks, locations, device cookies, database data or API keys are
  added to analytics events by this integration. The URL filter covers the
  documented event URL hook; it does not replace a review of Vercel's own
  collector metadata, privacy terms or any future SDK changes.
- Analytics requires no application API key, database migration, Supabase access
  or additional public environment variables. Existing CSP, cookie settings,
  permissions, GitHub Actions and user flows are unchanged. Do not add wildcard
  script/connect allowances for analytics: production endpoints are same-origin.
- Inspected the installed SDK entry points and package metadata. The new package
  has no runtime dependencies or install lifecycle script; its optional framework
  peer dependencies match the existing Next.js/React versions. The full npm audit
  reported zero known advisories. This does not certify Vercel's hosted collector.

## Validation

- Lint, type checking, all 118 unit tests (including 15 analytics privacy cases),
  the production build and browser bundle secret check passed.
- Chromium against the production build with the real SDK and a local substitute
  for Vercel's collector: a single deferred same-origin script across client
  navigation; redacted join/lobby URLs; design-kit/custom-event exclusion;
  no page exceptions or CSP violations. Navigation and name-form interaction
  also worked with the collector blocked. Synthetic API replies avoided any
  contact with hosted Supabase. No real visitor data was sent.
- Hosted Vercel ingestion/dashboard data has not been verified here. The collector
  substitute tests the integration contract, not Vercel's remote implementation.
- A separate build with `VERCEL_ENV=preview` passed. Chromium navigation and form
  interaction confirmed no analytics mount, queue or collector-script request.

## Enable in Vercel

1. Open the Pickle project in Vercel, select **Analytics**, and enable Web Analytics.
2. Deploy this branch's changes to production. PR previews intentionally do not
   collect analytics. No analytics key needs to be entered.
3. Visit the production site and navigate between pages. In browser Network tools,
   confirm `/_vercel/insights/script.js` loads and analytics requests succeed;
   check that reported pageview URLs contain route placeholders and no lobby code
   or query string. Confirm traffic appears in the Analytics dashboard afterward.
   Ad blockers may suppress collection; app navigation should keep working.

The analytics addition itself needs no database changes. PR #14 also contains
the earlier search security migration: follow `PR_14_CHANGES.md` before deploying
the complete branch. No merge, production deployment or hosted database change
was performed. Pushing the PR branch can trigger the existing Vercel preview.
