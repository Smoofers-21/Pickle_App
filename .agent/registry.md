# Agent registry

Maintained by `scripts/agent-coord.mjs`; do not edit by hand. Only the
coordinator grants, releases or transfers claims.

Coordinator: **claude-coordinator-0169tw**

## Actors

| Actor | Provider | Role | Team | Lead | Status | Tools |
|---|---|---|---|---|---|---|
| claude-coordinator-0169tw | claude | coordinator | core |  | online | git, github, supabase, vercel-previews |
| codex-reviewer-20261111-skill | codex | reviewer | review | claude-coordinator-0169tw | offline | git, shell |

## Tasks and claims

| Task | Goal | Owner | Status | Branch | Owned paths | Depends on |
|---|---|---|---|---|---|---|
| T-m4-search | Milestone 4: search with real data (PR #13) | claude-coordinator-0169tw | review | claude/lucid-turing-tzka4n | src/lib/places, src/lib/server, src/app/api, src/app/lobby, supabase |  |
| T-skills | Skills: /check-all, /apply-migration, /review-codex | claude-coordinator-0169tw | review | claude/lucid-turing-tzka4n | .claude/skills |  |
| T-m5-cards | Milestone 5: option cards (screen 12) and Pickle green Yes/No pills | unassigned | open |  | src/app/lobby, src/components/ui, public/images/restaurants | T-m4-search |
| T-pickle-team-standard | Pickle team skill (.claude/skills/pickle-team/SKILL.md) | unassigned | done | security/pickle-team-standard | .claude/skills/pickle-team |  |

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
    },
    "codex-reviewer-20261111-skill": {
      "provider": "codex",
      "role": "reviewer",
      "team": "review",
      "lead": "claude-coordinator-0169tw",
      "tools": [
        "git",
        "shell"
      ],
      "status": "offline",
      "registered": "2026-11-11T06:56:26Z",
      "seen": "2026-11-11T07:37:06Z"
    }
  },
  "tasks": {
    "T-m4-search": {
      "goal": "Milestone 4: search with real data (PR #13)",
      "owner": "claude-coordinator-0169tw",
      "lead": null,
      "status": "review",
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
      "updated": "2026-11-11T06:51:35Z"
    },
    "T-skills": {
      "goal": "Skills: /check-all, /apply-migration, /review-codex",
      "owner": "claude-coordinator-0169tw",
      "lead": null,
      "status": "review",
      "contextRevision": 1,
      "checkout": null,
      "branch": "claude/lucid-turing-tzka4n",
      "revision": "5c1ebaf",
      "paths": [
        ".claude/skills"
      ],
      "contracts": [],
      "dependsOn": [],
      "updated": "2026-11-11T06:56:19Z"
    },
    "T-m5-cards": {
      "goal": "Milestone 5: option cards (screen 12) and Pickle green Yes/No pills",
      "owner": null,
      "lead": null,
      "status": "open",
      "contextRevision": 1,
      "checkout": null,
      "branch": null,
      "revision": null,
      "paths": [
        "src/app/lobby",
        "src/components/ui",
        "public/images/restaurants"
      ],
      "contracts": [],
      "dependsOn": [
        "T-m4-search"
      ],
      "updated": "2026-11-11T06:51:40Z"
    },
    "T-pickle-team-standard": {
      "goal": "Pickle team skill (.claude/skills/pickle-team/SKILL.md)",
      "owner": null,
      "lead": null,
      "status": "done",
      "contextRevision": 1,
      "checkout": null,
      "branch": "security/pickle-team-standard",
      "revision": "1ba452e",
      "paths": [
        ".claude/skills/pickle-team"
      ],
      "contracts": [],
      "dependsOn": [],
      "updated": "2026-11-11T07:39:06Z"
    }
  }
}
```
