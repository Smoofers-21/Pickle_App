---
name: review-codex
description: Review a branch or PR that Codex (or another agent) made against our work in Pickle - fetch it, confirm what it is based on, read every change, run all checks on it, judge each finding, report to the owner, and fold accepted changes into our branch. Use when the owner says Codex reviewed or changed a PR, or shares a Codex branch, PR or handoff file.
---

# Review a Codex branch

## 1. Find it

- `git fetch origin --prune`, then find the branch (usually `security/pr-<n>-review`)
  and any PR for it (`list_pull_requests`).
- Check the coordination channel too: `agent-coord.mjs read` and `inbox`.
  Codex should report there (with branch, commit and checks); use that
  handoff when it exists.

## 2. What is it based on?

- `git log --oneline <ours>..origin/<theirs>`: their commits.
- `git merge-base --is-ancestor origin/<ours> origin/<theirs>`: does it
  contain our whole PR? If not, list what it is missing.
- `git diff --stat origin/<ours> origin/<theirs>`: the size of the change.

## 3. Read everything

- Their notes first (root `*.md` handoff files or the channel), then every
  changed file: migrations, server code, parsers, tests, docs.
- For each claim, check the code. For each fix, ask: is the problem real,
  is the fix in proportion, does it change behaviour the owner chose (spec,
  build plan), and does it break production or a preview?

## 4. Run the checks on their branch

- In a separate worktree with a real `npm ci` (Turbopack rejects a
  symlinked `node_modules`), or check out the branch:
  `npm run check:all`.
- Also look at the PR's own CI (`get_check_runs`).
- For a migration: build it locally (`check:sql`) and note that applying it to
  Supabase goes through `/apply-migration`.

## 5. Report to the owner

Plain language, short:
- **Verdict** first: take it, take it with changes, or not.
- **What it found**, ranked by importance, each in one or two lines.
- **Where you'd adjust**, including side effects the owner will notice
  (example: demo lobbies no longer use live search).
- **How to merge:** usually fold their commits into our branch
  (fast-forward when theirs contains ours) so one PR carries everything,
  then close theirs.
- **Database steps,** if any, and their order relative to the code.
Ask before merging, pushing to another branch, or touching Supabase.

## 6. Fold it in (after the owner agrees)

- `git merge --ff-only origin/<theirs>` on our branch (or a merge commit if it
  diverged; never rewrite their history).
- Move any root handoff files to `docs/reviews/` and fix their links.
- `npm ci` if dependencies changed, `npm run check:all`, push, update our
  PR's description.
- Coordination: reply to Codex's handoff with an acknowledgement and post a
  `decision` message per finding (accepted, adjusted or declined, with the
  reason) so it doesn't re-report them.
