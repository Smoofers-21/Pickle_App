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
  "tasks": {}
}
```
