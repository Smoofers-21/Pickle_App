# Agent communication protocol

How Claude, Codex and any other agent working on Pickle share context,
coordinate work, ask questions and hand off assignments, without duplicating
tasks. Every participating role follows it. Adopted Nov 11, 2026 from the
owner's specification; this file is the version adapted to how our agents
actually connect.

**Coordinator:** Claude (the owner's choice). The owner sets goals and has
final authority over everything below.

## How our agents connect

Claude and Codex run in separate cloud environments with no shared folder and
no direct messaging. The only storage both can reach is **git on GitHub**
(Codex's environment can push, but not call the GitHub API). So:

- **Shared location = the branch `agents/coordination`** in this repo. Its
  files are exactly the protocol's: `PROJECT_CONTEXT.md`,
  `.agent/registry.md`, `.agent/channel.md`, `.agent/handoff.md` and
  `.agent/inboxes/<actor-id>.md`.
- **Each agent checks it out** in its own worktree at `.agent-coord/` under
  its coordination root (the primary worktree, first in
  `git worktree list --porcelain`), separate from its code checkout. It is
  never merged into `main`.
- **All reads and writes go through one script,**
  `scripts/agent-coord.mjs`, so every provider follows the same
  implementation. Never edit the coordination files by hand.
- **Lock = local mutex + git push.** Each write takes the local mutex
  (exclusive create of `.agent/.coordination-lock` holding actor, token and
  time), fetches, resets to the remote, rereads the state, applies the change,
  commits and pushes. If another agent pushed first, git refuses the push
  (non-fast-forward): the script rereads and retries. That makes every
  registry change, claim, message and handoff a compare-and-swap on the
  branch, so two agents can't both win an overlapping claim.
- **No native notifications:** neither agent can wake the other. Agents
  check the branch at the points in "Delivery" below, and the owner relays
  "check your inbox" when a sleeping session needs to act.

Setup, once per checkout:

```bash
node scripts/agent-coord.mjs setup
```

## 1. Actors

Every running session has a unique ID: `<provider>-<role>-<session>`, for
example `claude-coordinator-0169tw` or `codex-reviewer-pr13`. A new session
gets a new ID, even when it resumes a task. Set it for every command:

```bash
export AGENT_ID=codex-reviewer-pr13
node scripts/agent-coord.mjs register --provider codex --role reviewer --team review --lead <coordinator-id> --tools git,shell
```

| Team | Lead | Who | Does |
|---|---|---|---|
| core | Claude coordinator | Claude sessions | Builds milestones, owns PRs, applies migrations with the owner's OK |
| review | Claude coordinator | Codex reviewers | Security and correctness reviews of open PRs; proposes fixes on its own branches |
| (new) | assigned by the coordinator | other agents | Register, then ask the coordinator for a team |

Specialist agents report to their lead. Address a team with `--to team:review`.

## 2. Read before acting

On startup, resumption or context compaction, and before editing, handing
off or accepting verification:

```bash
node scripts/agent-coord.mjs read
```

It prints the context revision, the registry (who owns what) and your unread
and pending messages. Rebuild your assignment from these records, not from
memory. If the context revision or your claim changed since your assignment,
pause the affected work and ask the coordinator to reconcile; independent
work that is still valid can continue.

Authority: the owner's instructions set goals; accepted decisions live in
`PROJECT_CONTEXT.md`; code and executed checks show actual behavior. Report
disagreements between them. A peer proposal becomes a decision only when the
coordinator accepts it.

## 3. Messages

```bash
node scripts/agent-coord.mjs post --to <actor|ALL|team:T> --type question --task T-12 \
  --message "Does finish_search still accept a tokenless call?" --requires-response --refs "supabase/migrations/…003…"
```

Types: update, question, proposal, help-offer, blocker, decision,
acknowledgement. Each record carries the message ID, UTC time, sender,
recipients, type, task, context revision, reply-to, whether a response is
required, the message and references, and ends with `END <id>`. Keep messages
concise: the exact task, file, contract or decision, the evidence, and a
concrete request. Never include credentials, keys, locations or member data.

Replies reference the original ID. An acknowledgement means "received";
report completion separately, with the result and evidence. Correct a
message by posting a new one that references it.

## 4. Delivery and inboxes

The channel is the durable record. Check it (`read` or `inbox`) at startup,
before edits, between major steps, on resumption and before a handoff; during
long sessions about every 60 seconds when tools allow, backing off when
nothing changes.

```bash
node scripts/agent-coord.mjs inbox                 # unread + pending
node scripts/agent-coord.mjs inbox --advance       # move the cursor; requests needing a response stay pending
node scripts/agent-coord.mjs inbox --resolve M-…   # done with a request
```

Each actor owns its inbox: a read cursor plus requests still needing action.
Retries reuse the original message, task or handoff ID (`--id`), and the
script records each ID once. Mark yourself offline when you stop
(`register --status offline`). Requests stay pending until acknowledged or
reassigned. Report actual delivery status: "posted, not yet acknowledged" is
not "delivered".

## 5. Claims before implementation

Nobody implements without a claim granted by the coordinator.

```bash
# coordinator
node scripts/agent-coord.mjs task create --id T-m5-cards --goal "Milestone 5 option cards" \
  --paths "src/app/lobby,src/components/ui" --contracts "lobby-state" --branch claude/… --deps T-m4
node scripts/agent-coord.mjs task grant --id T-m5-cards --owner <actor>
```

- Before creating a task the coordinator checks for the same objective (the
  script rejects a duplicate goal and reuses an existing task ID).
- Directory claims cover everything below them. Shared APIs, schemas
  (`supabase/migrations`), `package.json` / lockfile and build configuration
  are coordinated explicitly as paths or contracts.
- A grant that overlaps another active claim is refused.
- Need more paths? Ask for a wider claim first (`post --type proposal`).
- Offers of help become work only through a grant.
- Claims last until the coordinator records release or transfer: silence or
  time never releases a claim. On interruption, record the remaining work
  (`task update --status blocked` plus a message).

## 6. Handoffs

```bash
node scripts/agent-coord.mjs handoff --to <actor> --task T-m5-cards --branch … --revision <sha> \
  --completed "…" --changed "…" --checks "npm test: 118 passed" --unresolved "…" --next "…"
node scripts/agent-coord.mjs handoff --ack H-…            # recipient, after verifying the state
node scripts/agent-coord.mjs task transfer --id T-m5-cards --owner <recipient>   # coordinator
```

The sender stops editing when offering the transfer. The recipient checks the
referenced commit and acknowledges, then the coordinator records the new
owner, and only then does the recipient start. A rejected handoff is
acknowledged with `--result rejected` and the needed correction; retry the
same handoff ID rather than creating a new assignment.

## 7. Shared writes

All handled by the script: local mutex by exclusive create, reread after
locking, atomic temp-file-and-rename for the registry, context and inboxes,
appends of complete records only, verification after writing, and release of
only the lock this operation owns. Tools, tests and conversations happen
outside the lock. If a lock is left behind, `lock-recover` removes it only
after confirming its process has stopped. Partial records (no `END` line) are
ignored by every reader.

## 8. Context and permissions

Only the coordinator changes `PROJECT_CONTEXT.md`
(`context-publish --file …`, which increments the revision). Decisions carry
an ID, rationale, evidence, the contracts they affect and what they
supersede, and proposed / implemented / merged stay distinct. Every agent may
post, hand off and manage its own inbox. Role permissions on project files
are unchanged: a reviewer writes coordination records but keeps code, tests
and configuration read-only unless granted a claim.

After compaction or a new session, rebuild from these records; summaries keep
open questions, owners, decision IDs, dependencies and evidence references.
Only the coordinator archives logs, and only after preserving message IDs and
everyone's pending work.

## 9. Verification

`src/lib/agent-coord.test.ts` runs the protocol between two providers in
separate clones of a temporary git remote:

- two providers exchange, acknowledge and resolve a message;
- simultaneous posts from three sessions all land;
- a retried message ID produces one record;
- simultaneous overlapping grants produce exactly one owner;
- only the coordinator creates, grants or publishes context; duplicate
  objectives are refused and task IDs reused;
- a reviewer can post but not change claims;
- handoff and acknowledgement, with unknown handoffs rejected;
- a partially written record is ignored, and a restarted session rebuilds
  from the branch.

Needs a live integration (not covered by the tests): pushes between the real
Claude and Codex environments, and an unavailable recipient waking up (no
provider can wake another; the owner relays).
