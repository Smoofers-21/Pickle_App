# PR #18: Leave lobby on every screen (Codex)

[PR #18](https://github.com/Smoofers-21/Pickle_App/pull/18), branch
`security/pr-17-leave-lobby`, commit `8fa2f3f`, based on PR #17 at `7dc69a0`.
Reviewed by the Claude coordinator on Nov 12, 2026 and folded into PR #17 by
fast-forward (GitHub marks #18 merged).

## What it does

- Adds one outlined **Leave lobby** button at the top-right of the lobby and
  every game screen (setup, picks, waiting, searching, nothing found, cards and
  the ranking placeholder). Before, there was no way out once a game started.
- The confirm dialog blocks double submits ("Leaving…"), shows a retry message
  if the request fails, and keeps the current screen (and seen cards) on Cancel.
- If the leave succeeds but its reply is lost, the next state check (not a
  member any more) still sends the phone home once, instead of to Join.
- The host's dialog names the next host the same way the server picks one:
  the earliest-joined real member, never a demo friend.
- `ConfirmDialog` gains optional `pending` and `error` props and proper
  `aria-labelledby` / `aria-describedby`; it stops key presses from reaching
  the card arrows behind it.

## Review

- **Accepted.** No server, database, API or package changes; the existing
  rate-limited leave route and `leave_lobby` SQL do the work.
  `npm run check:all` passed on the branch and after folding it in.
- **Adjusted (`5bef0a6`):** the dialog said leaving mid-game "may prevent you
  from rejoining". `join_lobby` lets a phone return to its own spot even after
  the lobby locks, so the text now says "You can come back from this phone with
  the same code", or "No one else can host, so the lobby will end" when the
  host has no real successor. The spec and screens README entries were
  shortened to owner-facing wording.
- **Side effect:** the Leave row sits above every screen, so the option card is
  slightly shorter. Revisit if it feels cramped on small phones.
