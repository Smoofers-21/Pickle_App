<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working with other agents (all agents: Codex, Claude and others)

Several agents work on this repo. Follow `docs/agents/protocol.md` so nobody
duplicates work. Claude is the coordinator; the owner has final say.

1. Once per checkout: `node scripts/agent-coord.mjs setup`.
2. Pick an ID for this session, `<provider>-<role>-<session>` (for example
   `codex-reviewer-pr15`), set `AGENT_ID` to it and `register`.
3. Before acting, and again before edits and handoffs: `read`, then
   `inbox`. Rebuild your task from the records, not memory.
4. Don't change code until the coordinator has granted you a claim for those
   paths. Ask with `post --type proposal`. Reviews need no claim: post findings
   as messages, and put proposed fixes on your own branch.
5. Report results with `post` (update / blocker) or `handoff`, with the
   branch, commit and checks. Don't leave handoff notes in the repo root.
6. Never put keys, tokens, locations or member data in any message.
7. Run `npm run check:all` before reporting work as done, and quote its
   summary in your handoff.
