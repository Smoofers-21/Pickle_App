# Agent registry

Maintained by `scripts/agent-coord.mjs`; do not edit by hand. Only the
coordinator grants, releases or transfers claims.

Coordinator: **claude-coordinator-0169tw**

## Actors

| Actor | Provider | Role | Team | Lead | Status | Tools |
|---|---|---|---|---|---|---|
| claude-coordinator-0169tw | claude | coordinator | core |  | online | git, github, supabase, vercel-previews |

## Tasks and claims

| Task | Goal | Owner | Status | Branch | Owned paths | Depends on |
|---|---|---|---|---|---|---|
| T-m4-search | Milestone 4: search with real data (PR #13) | unassigned | open | claude/lucid-turing-tzka4n | src/lib/places, src/lib/server, src/app/api, src/app/lobby, supabase |  |

## Data (machine-readable)

```json registry
{
  "version": 1,
  "coordinator": "claude-coordinator-0169tw",
  "actors": {
    "claude-coordinator-0169tw": {
      "provider": "claude",
      "role": "coordinator",
      "team": "core",
      "lead": null,
      "tools": [
        "git",
        "github",
        "supabase",
        "vercel-previews"
      ],
      "status": "online",
      "registered": "2026-11-11T06:51:07Z",
      "seen": "2026-11-11T06:51:07Z"
    }
  },
  "tasks": {
    "T-m4-search": {
      "goal": "Milestone 4: search with real data (PR #13)",
      "owner": null,
      "lead": null,
      "status": "open",
      "contextRevision": 1,
      "checkout": null,
      "branch": "claude/lucid-turing-tzka4n",
      "revision": null,
      "paths": [
        "src/lib/places",
        "src/lib/server",
        "src/app/api",
        "src/app/lobby",
        "supabase"
      ],
      "contracts": [],
      "dependsOn": [],
      "updated": "2026-11-11T06:51:31Z"
    }
  }
}
```
