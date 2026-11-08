# Pickle

Friend group app to decide what to do, by voting on restaurants, bars and events near you.

## Docs

- [Build order](docs/build-order.md): the order milestones are built in (start here)
- [Build plan](docs/build-plan.md): architecture, data model, security and each milestone's tests
- [Product spec](docs/product-spec.md): what the app does and how it looks

## Run it locally

Needs Node.js 20.9 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000. The design kit preview is at http://localhost:3000/kit.

Copy `.env.example` to `.env.local` when a milestone needs settings (from milestone 2). Never commit `.env.local`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app for development |
| `npm run build` | Production build (what Vercel runs) |
| `npm run lint` | Check code style |
| `npm run typecheck` | Check TypeScript types |
| `npm run logos` | Remake every logo and icon from `public/logo/pickle-logo.png` |
| `npm run check:secrets` | The pre-commit secret check (runs automatically on every commit) |

## Security basics

- Secret keys live only in Vercel's environment settings and `.env.local`, are read through `src/lib/server-env.ts`, and never use the `NEXT_PUBLIC_` prefix (the build stops if one does).
- Every commit runs a secret check (`.husky/pre-commit`). It also runs [gitleaks](https://github.com/gitleaks/gitleaks) if installed, and GitHub Actions runs gitleaks on every push.
- Security headers (content security policy, no framing, strict referrer policy, location limited to this site) are set in `next.config.ts`.
