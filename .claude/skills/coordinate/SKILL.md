---
name: coordinate
description: Coordinate with Codex and other agents through the shared agents/coordination branch (docs/agents/protocol.md). Use at the start of every session, before editing, before handoffs, when the owner relays "check your inbox", and whenever assigning, claiming or handing off work. Claude is the project coordinator.
---

# Coordinate with other agents

Claude is the **coordinator** for Pickle (the owner's decision). The full
rules are in `docs/agents/protocol.md`; this is the routine.

## Every session

1. `node scripts/agent-coord.mjs setup` (once per checkout; it reuses an existing one).
2. Pick this session's ID: `claude-coordinator-<first 6 characters of the session id>`.
   Pass it on every call: `AGENT_ID=<id> node scripts/agent-coord.mjs …`.
3. `register --provider claude --role coordinator --team core --tools git,github,supabase` (add `--coordinator`
   only if `read` shows no coordinator; the registry keeps one).
4. `read`, then `inbox`. Rebuild the current assignment from the context
   revision, the registry and pending messages before doing anything else.

## As coordinator

- **Before starting any work** (a milestone, a fix, a review follow-up),
  create the task and grant it: `task create --id T-… --goal … --paths … [--contracts …] [--deps …]`,
  then `task grant --id T-… --owner <actor>`. If the goal already exists,
  reuse that task. If a grant reports a scope conflict, sort out ownership
  first.
- **Shared contracts** need explicit ownership: `supabase/migrations`,
  `src/lib/lobby-types.ts` (lobby state), `package.json` and lockfile,
  `next.config.ts`, CI workflows.
- **Codex reviews**: create a review task owned by the Codex reviewer, with
  paths it may read and its own branch. Its findings arrive as messages;
  answer each with a decision (`post --type decision`), then fold accepted
  fixes in under your own claim.
- **Decisions**: when the owner accepts one, update `PROJECT_CONTEXT.md` with
  a decision ID and `context-publish --file`, and keep proposed / implemented / merged distinct.
- **Handoffs**: verify the referenced commit, ack it, then `task transfer`.
- **Done**: `task release --id T-… --status done` after merge.

## Between steps

Check `inbox` before edits, between major steps and before finishing. Advance
the cursor with `inbox --advance`; resolve handled requests with
`inbox --resolve <ids>`. Mark yourself offline before ending a long session:
`register --status offline`.

## Never

- Edit coordination files by hand, or merge `agents/coordination` into `main`.
- Put keys, tokens, locations or member data in a message.
- Start code changes without a granted claim, or release a claim because it
  went quiet.
