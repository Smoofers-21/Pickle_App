# Agent registry

Maintained by `scripts/agent-coord.mjs`; do not edit by hand. Only the
coordinator grants, releases or transfers claims.

Coordinator: **claude-coordinator-0169tw**

## Actors

| Actor | Provider | Role | Team | Lead | Status | Tools |
|---|---|---|---|---|---|---|
| claude-coordinator-0169tw | claude | coordinator | core |  | online | git, github, supabase, vercel-previews |
| codex-reviewer-20261111-skill | codex | reviewer | review | claude-coordinator-0169tw | offline | git, shell |
| codex-lead-pr17-leave-20261112 | codex | lead | review | claude-coordinator-0169tw | offline | git, shell, browser, subagents |
| codex-reviewer-pr19-20261112 | codex | reviewer | review | claude-coordinator-0169tw | online | git, shell |

## Tasks and claims

| Task | Goal | Owner | Status | Branch | Owned paths | Depends on |
|---|---|---|---|---|---|---|
| T-m4-search | Milestone 4: search with real data (PR #13) | unassigned | done | claude/lucid-turing-tzka4n | src/lib/places, src/lib/server, src/app/api, src/app/lobby, supabase |  |
| T-skills | Skills: /check-all, /apply-migration, /review-codex | unassigned | done | claude/lucid-turing-tzka4n | .claude/skills |  |
| T-m5-cards | Milestone 5: option cards (screen 12) and Pickle green Yes/No pills | unassigned | done |  | src/app/lobby, src/components/ui, public/images/restaurants | T-m4-search |
| T-pickle-team-standard | Pickle team skill (.claude/skills/pickle-team/SKILL.md) | unassigned | done | security/pickle-team-standard | .claude/skills/pickle-team |  |
| T-m6-voting | Milestone 6: voting and rounds (screens 13-15) | claude-coordinator-0169tw | review | claude/lucid-turing-tzka4n | src/app/lobby, src/app/api/lobbies, src/lib/game, src/lib/server, src/lib/lobby-types.ts, src/components/ui, supabase | T-m5-cards |

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
      "seen": "2026-11-11T23:11:30Z"
    },
    "codex-lead-pr17-leave-20261112": {
      "provider": "codex",
      "role": "lead",
      "team": "review",
      "lead": "claude-coordinator-0169tw",
      "tools": [
        "git",
        "shell",
        "browser",
        "subagents"
      ],
      "status": "offline",
      "registered": "2026-11-12T00:08:24Z",
      "seen": "2026-11-12T00:33:15Z"
    },
    "codex-reviewer-pr19-20261112": {
      "provider": "codex",
      "role": "reviewer",
      "team": "review",
      "lead": "claude-coordinator-0169tw",
      "tools": [
        "git",
        "shell"
      ],
      "status": "online",
      "registered": "2026-11-12T04:12:45Z",
      "seen": "2026-11-12T04:12:45Z"
    }
  },
  "tasks": {
    "T-m4-search": {
      "goal": "Milestone 4: search with real data (PR #13)",
      "owner": null,
      "lead": null,
      "status": "done",
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
      "updated": "2026-11-11T07:44:44Z"
    },
    "T-skills": {
      "goal": "Skills: /check-all, /apply-migration, /review-codex",
      "owner": null,
      "lead": null,
      "status": "done",
      "contextRevision": 1,
      "checkout": null,
      "branch": "claude/lucid-turing-tzka4n",
      "revision": "5c1ebaf",
      "paths": [
        ".claude/skills"
      ],
      "contracts": [],
      "dependsOn": [],
      "updated": "2026-11-11T07:44:47Z"
    },
    "T-m5-cards": {
      "goal": "Milestone 5: option cards (screen 12) and Pickle green Yes/No pills",
      "owner": null,
      "lead": null,
      "status": "done",
      "contextRevision": 2,
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
      "updated": "2026-11-12T01:35:16Z"
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
    },
    "T-m6-voting": {
      "goal": "Milestone 6: voting and rounds (screens 13-15)",
      "owner": "claude-coordinator-0169tw",
      "lead": null,
      "status": "review",
      "contextRevision": 3,
      "checkout": null,
      "branch": "claude/lucid-turing-tzka4n",
      "revision": null,
      "paths": [
        "src/app/lobby",
        "src/app/api/lobbies",
        "src/lib/game",
        "src/lib/server",
        "src/lib/lobby-types.ts",
        "src/components/ui",
        "supabase"
      ],
      "contracts": [
        "lobby-state",
        "votes-schema"
      ],
      "dependsOn": [
        "T-m5-cards"
      ],
      "updated": "2026-11-12T01:46:19Z"
    }
  }
}
```
