#!/usr/bin/env node
// Shared agent coordination (docs/agents/protocol.md).
//
// Claude, Codex and any other agent run this same script, so every provider
// follows one implementation. Shared state lives on the git branch
// `agents/coordination` (the only storage every agent can reach). It is
// checked out in its own worktree at `.agent-coord/`, separate from your work.
//
// Every write is one transaction:
//   local mutex (.agent/.coordination-lock, exclusive create) → fetch →
//   reset to the remote → reread state → apply → commit → push.
// A rejected push means another agent wrote first: reset, reread, retry.
// The push is the cross-machine lock; the mutex covers agents on one machine.
//
// Usage: AGENT_ID=<your id> node scripts/agent-coord.mjs <command> [--flags]
// Run with no command for help.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BRANCH = process.env.AGENT_COORD_BRANCH || "agents/coordination";
const REMOTE = process.env.AGENT_COORD_REMOTE || "origin";
const MAX_TRIES = 6;

// ---------------------------------------------------------------------------
// Paths and git
// ---------------------------------------------------------------------------

function git(cwd, args, opts = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

function tryGit(cwd, args) {
  try {
    return { ok: true, out: git(cwd, args) };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** The coordination root: the primary worktree (first in `git worktree list`), unless AGENT_COORD_ROOT is set. */
export function coordinationRoot(cwd = process.cwd()) {
  if (process.env.AGENT_COORD_ROOT) return path.resolve(process.env.AGENT_COORD_ROOT);
  const list = git(cwd, ["worktree", "list", "--porcelain"]);
  const first = list.split("\n").find((l) => l.startsWith("worktree "));
  return first ? first.slice("worktree ".length) : git(cwd, ["rev-parse", "--show-toplevel"]);
}

export function stateDir(cwd) {
  return path.join(coordinationRoot(cwd), ".agent-coord");
}

const P = {
  context: "PROJECT_CONTEXT.md",
  registry: ".agent/registry.md",
  channel: ".agent/channel.md",
  handoff: ".agent/handoff.md",
  lock: ".agent/.coordination-lock",
  inbox: (id) => `.agent/inboxes/${id}.md`,
};

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const stamp = () => now().replace(/[-:TZ]/g, "").slice(0, 14);
const short = (id) => id.replace(/[^a-z0-9]/gi, "").slice(-6);
export const newId = (prefix, actor) => `${prefix}-${stamp()}-${short(actor)}-${randomBytes(2).toString("hex")}`;

// ---------------------------------------------------------------------------
// Records: complete only when the END marker is present
// ---------------------------------------------------------------------------

/** Parses `## <id>` … `END <id>` records. Incomplete (partially written) records are ignored. */
export function parseRecords(text) {
  const out = [];
  const re = /^## (\S+)\n([\s\S]*?)^END \1$/gm;
  for (const m of text.matchAll(re)) {
    const fields = {};
    for (const line of m[2].split("\n")) {
      const f = /^- ([^—]+?) — ([\s\S]*)$/.exec(line);
      if (f) fields[f[1].trim()] = f[2].trim();
    }
    out.push({ id: m[1], fields });
  }
  return out;
}

const clean = (v) => String(v ?? "").replace(/\r?\n/g, " ").trim();

export function formatRecord(id, fields) {
  const lines = Object.entries(fields).map(([k, v]) => `- ${k} — ${clean(v) || "none"}`);
  return `\n## ${id}\n${lines.join("\n")}\nEND ${id}\n`;
}

// ---------------------------------------------------------------------------
// Reading state: from the transaction's checkout, or read-only from the branch
// ---------------------------------------------------------------------------

/**
 * `src` is a checkout directory (inside a transaction) or a snapshot from
 * `remoteSnapshot` (read-only commands). Snapshots read committed files with
 * `git show` and never touch the checkout, so a read can't undo a write that
 * another command on this machine is in the middle of (C1).
 */
function readText(src, rel) {
  if (typeof src === "object") return src.read(rel);
  const file = path.join(src, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function fetchBranch(cwd) {
  // An explicit refspec, so the remote-tracking ref updates even in a clone
  // that was set up to fetch only main (C3).
  return tryGit(cwd, ["fetch", "--quiet", REMOTE, `+refs/heads/${BRANCH}:refs/remotes/${REMOTE}/${BRANCH}`]);
}

export function remoteSnapshot(dir) {
  const fetched = fetchBranch(dir);
  if (!fetched.ok) throw new Error(`cannot fetch ${REMOTE}/${BRANCH}: ${fetched.out.trim()}`);
  const ref = git(dir, ["rev-parse", `${REMOTE}/${BRANCH}`]);
  return {
    ref,
    read(rel) {
      const r = tryGit(dir, ["show", `${ref}:${rel}`]);
      return r.ok ? r.out + "\n" : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Registry (human tables + one machine-readable JSON block)
// ---------------------------------------------------------------------------

const EMPTY_REGISTRY = { version: 1, coordinator: null, actors: {}, tasks: {} };

export function readRegistry(src) {
  const text = readText(src, P.registry);
  if (text === null) return structuredClone(EMPTY_REGISTRY);
  const m = /```json registry\n([\s\S]*?)\n```/.exec(text);
  return m ? JSON.parse(m[1]) : structuredClone(EMPTY_REGISTRY);
}

export function renderRegistry(reg) {
  const actorRows = Object.entries(reg.actors).map(
    ([id, a]) => `| ${id} | ${a.provider} | ${a.role} | ${a.team ?? ""} | ${a.lead ?? ""} | ${a.status} | ${(a.tools ?? []).join(", ")} |`,
  );
  const taskRows = Object.entries(reg.tasks).map(
    ([id, t]) =>
      `| ${id} | ${t.goal} | ${t.owner ?? "unassigned"} | ${t.status} | ${t.branch ?? ""} | ${(t.paths ?? []).join(", ")} | ${(t.dependsOn ?? []).join(", ")} |`,
  );
  return `# Agent registry

Maintained by \`scripts/agent-coord.mjs\`; do not edit by hand. Only the
coordinator grants, releases or transfers claims.

Coordinator: **${reg.coordinator ?? "none"}**

## Actors

| Actor | Provider | Role | Team | Lead | Status | Tools |
|---|---|---|---|---|---|---|
${actorRows.join("\n")}

## Tasks and claims

| Task | Goal | Owner | Status | Branch | Owned paths | Depends on |
|---|---|---|---|---|---|---|
${taskRows.join("\n")}

## Data (machine-readable)

\`\`\`json registry
${JSON.stringify(reg, null, 2)}
\`\`\`
`;
}

/** Same path, or one inside the other (a directory claim covers its descendants). */
export function pathsOverlap(a, b) {
  const norm = (p) => p.replace(/^\.\//, "").replace(/\/+$/, "");
  const [x, y] = [norm(a), norm(b)];
  return x === y || x === "" || y === "" || y.startsWith(`${x}/`) || x.startsWith(`${y}/`);
}

/** Active claims (other tasks) whose paths or contracts overlap the requested scope. */
export function claimConflicts(reg, taskId, paths, contracts = []) {
  const conflicts = [];
  for (const [id, t] of Object.entries(reg.tasks)) {
    if (id === taskId || !t.owner || ["done", "released"].includes(t.status)) continue;
    for (const p of paths) for (const q of t.paths ?? []) if (pathsOverlap(p, q)) conflicts.push(`${id} owns ${q}`);
    for (const c of contracts) if ((t.contracts ?? []).includes(c)) conflicts.push(`${id} owns contract ${c}`);
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Atomic file writes and the local mutex
// ---------------------------------------------------------------------------

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function appendRecord(file, id, record) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (parseRecords(text).some((r) => r.id === id)) return false; // retry: already recorded
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, record);
  if (!parseRecords(fs.readFileSync(file, "utf8")).some((r) => r.id === id)) throw new Error(`write of ${id} not verified`);
  return true;
}

function acquireLock(dir, actor) {
  const file = path.join(dir, P.lock);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = randomBytes(8).toString("hex");
  for (let i = 0; i < 50; i++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ actor, token, pid: process.pid, at: now() }), { flag: "wx" });
      return token;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  const holder = fs.readFileSync(file, "utf8");
  throw new Error(`coordination lock busy: ${holder}. If that process has stopped, run "lock-recover".`);
}

function releaseLock(dir, token) {
  const file = path.join(dir, P.lock);
  try {
    if (JSON.parse(fs.readFileSync(file, "utf8")).token === token) fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
}

// ---------------------------------------------------------------------------
// Transactions over the coordination branch
// ---------------------------------------------------------------------------

function ensureWorktree(cwd) {
  const dir = stateDir(cwd);
  if (!fs.existsSync(path.join(dir, ".git"))) {
    throw new Error(`No coordination checkout at ${dir}. Run: node scripts/agent-coord.mjs setup`);
  }
  return dir;
}

function syncToRemote(dir) {
  const fetched = fetchBranch(dir);
  if (!fetched.ok) throw new Error(`cannot fetch ${REMOTE}/${BRANCH}: ${fetched.out.trim()}`);
  git(dir, ["reset", "--quiet", "--hard", `${REMOTE}/${BRANCH}`]);
  git(dir, ["clean", "--quiet", "-fd", "-e", ".agent/.coordination-lock"]);
}

/**
 * Runs `apply(dir, reg)` against freshly fetched state, commits and pushes.
 * `apply` returns a result; it may throw to abort (nothing is pushed).
 */
export function transaction(cwd, actor, summary, apply) {
  const dir = ensureWorktree(cwd);
  const token = acquireLock(dir, actor);
  try {
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      syncToRemote(dir);
      const reg = readRegistry(dir);
      const result = apply(dir, reg);
      git(dir, ["add", "-A"]); // the lock file is in the branch's .gitignore
      const changed = !tryGit(dir, ["diff", "--cached", "--quiet"]).ok;
      if (!changed && result && result.added === true) {
        // The write reported success but nothing reached the checkout: never report it as done.
        if (attempt === MAX_TRIES) throw new Error("write was lost before it could be committed; retry the command");
        continue;
      }
      if (changed) {
        git(dir, ["-c", "user.name=agent-coord", "-c", "user.email=agent-coord@users.noreply.github.com",
          "commit", "--quiet", "-m", `${actor}: ${summary}`]);
        const pushed = tryGit(dir, ["push", "--quiet", REMOTE, `HEAD:${BRANCH}`]);
        if (!pushed.ok) {
          if (attempt === MAX_TRIES) throw new Error(`push failed after ${MAX_TRIES} tries: ${pushed.out.trim()}`);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * attempt + Math.random() * 300);
          continue; // someone else wrote first: reread and retry
        }
      }
      return result;
    }
  } finally {
    releaseLock(dir, token);
  }
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function contextRevision(src) {
  const text = readText(src, P.context);
  const m = text ? /Context revision:\s*(\d+)/.exec(text) : null;
  return m ? Number(m[1]) : 0;
}

function requireCoordinator(reg, actor) {
  if (reg.coordinator !== actor) throw new Error(`only the coordinator (${reg.coordinator}) can do this`);
}

function requireActor(reg, actor) {
  if (!reg.actors[actor]) throw new Error(`${actor} is not registered; run "register" first`);
}

export function postMessage(dir, reg, actor, o) {
  requireActor(reg, actor);
  const id = o.id || newId("M", actor);
  const added = appendRecord(path.join(dir, P.channel), id, formatRecord(id, {
    "UTC time": now(),
    From: actor,
    To: o.to || "ALL",
    Type: o.type || "update",
    Task: o.task || "PROJECT",
    "Context revision": contextRevision(dir),
    "Reply to": o["reply-to"] || "none",
    "Requires response": o["requires-response"] ? "yes" : "no",
    Message: o.message,
    References: o.refs || "none",
  }));
  return { id, added };
}

const INBOX_HEADER = (actor) => `# Inbox: ${actor}\n\nOwned by ${actor}. Read cursor and pending requests (managed by scripts/agent-coord.mjs).\n\n`;

export function readInbox(src, actor) {
  const text = readText(src, P.inbox(actor));
  if (text === null) return { cursor: null, pending: [] };
  const m = /```json inbox\n([\s\S]*?)\n```/.exec(text);
  return m ? JSON.parse(m[1]) : { cursor: null, pending: [] };
}

function writeInbox(dir, actor, box) {
  const lines = box.pending.map((p) => `- ${p}`).join("\n") || "- none";
  writeAtomic(path.join(dir, P.inbox(actor)),
    `${INBOX_HEADER(actor)}Cursor: ${box.cursor ?? "none"}\n\nPending (need action):\n${lines}\n\n\`\`\`json inbox\n${JSON.stringify(box, null, 2)}\n\`\`\`\n`);
}

const addressedTo = (rec, actor, reg) => {
  const to = (rec.fields.To || "").split(/[,\s]+/).filter(Boolean);
  const team = reg.actors[actor]?.team;
  return to.includes("ALL") || to.includes(actor) || (team && to.includes(`team:${team}`));
};

/** Messages addressed to the actor after its cursor, plus requests still pending. */
export function unread(dir, reg, actor) {
  const records = parseRecords(readText(dir, P.channel) ?? "");
  const box = readInbox(dir, actor);
  const start = box.cursor ? records.findIndex((r) => r.id === box.cursor) + 1 : 0;
  const fresh = records.slice(start).filter((r) => r.fields.From !== actor && addressedTo(r, actor, reg));
  const pending = records.filter((r) => box.pending.includes(r.id));
  return { records, box, fresh, pending };
}

export function advanceInbox(dir, reg, actor) {
  const { records, box, fresh } = unread(dir, reg, actor);
  const keep = new Set(box.pending);
  for (const r of fresh) if (r.fields["Requires response"] === "yes") keep.add(r.id);
  const next = { cursor: records.at(-1)?.id ?? box.cursor, pending: [...keep] };
  writeInbox(dir, actor, next);
  return next;
}

export function resolveInbox(dir, actor, ids) {
  const box = readInbox(dir, actor);
  box.pending = box.pending.filter((id) => !ids.includes(id));
  writeInbox(dir, actor, box);
  return box;
}

export function register(dir, reg, actor, o) {
  const existing = reg.actors[actor];
  reg.actors[actor] = {
    provider: o.provider || existing?.provider || actor.split("-")[0],
    role: o.role || existing?.role || "agent",
    team: o.team || existing?.team || null,
    lead: o.lead || existing?.lead || null,
    tools: o.tools ? o.tools.split(",").map((s) => s.trim()) : existing?.tools ?? [],
    status: o.status || "online",
    registered: existing?.registered || now(),
    seen: now(),
  };
  if (o.coordinator) {
    if (reg.coordinator && reg.coordinator !== actor) throw new Error(`coordinator already registered: ${reg.coordinator}`);
    reg.coordinator = actor;
  }
  writeAtomic(path.join(dir, P.registry), renderRegistry(reg));
  if (!fs.existsSync(path.join(dir, P.inbox(actor)))) writeInbox(dir, actor, { cursor: null, pending: [] });
  return reg.actors[actor];
}

const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);

export function taskOp(dir, reg, actor, op, o) {
  const id = o.id;
  if (!id) throw new Error("--id is required");
  const t = reg.tasks[id];
  if (op === "create") {
    requireCoordinator(reg, actor);
    if (t) return { id, existed: true }; // same objective: reuse the task
    const dup = Object.entries(reg.tasks).find(([, x]) => x.goal.toLowerCase() === String(o.goal).toLowerCase() && x.status !== "done");
    if (dup) throw new Error(`duplicate objective: task ${dup[0]} already covers "${o.goal}"`);
    reg.tasks[id] = {
      goal: o.goal, owner: null, lead: o.lead || null, status: "open",
      contextRevision: contextRevision(dir), checkout: o.checkout || null, branch: o.branch || null,
      revision: o.revision || null, paths: list(o.paths), contracts: list(o.contracts), dependsOn: list(o.deps),
      updated: now(),
    };
  } else if (op === "grant" || op === "transfer") {
    requireCoordinator(reg, actor);
    if (!t) throw new Error(`no task ${id}`);
    if (!reg.actors[o.owner]) throw new Error(`${o.owner} is not registered`);
    if (op === "grant" && t.owner && t.owner !== o.owner) throw new Error(`${id} is owned by ${t.owner}; use transfer after a handoff`);
    const paths = o.paths ? list(o.paths) : t.paths;
    const contracts = o.contracts ? list(o.contracts) : t.contracts;
    const conflicts = claimConflicts(reg, id, paths, contracts);
    if (conflicts.length) throw new Error(`scope conflict: ${conflicts.join("; ")}`);
    Object.assign(t, { owner: o.owner, paths, contracts, status: "claimed", contextRevision: contextRevision(dir), updated: now() });
    if (o.branch) t.branch = o.branch;
    if (o.revision) t.revision = o.revision;
  } else if (op === "release") {
    requireCoordinator(reg, actor);
    if (!t) throw new Error(`no task ${id}`);
    Object.assign(t, { owner: null, status: o.status || "released", updated: now() });
  } else if (op === "update") {
    if (!t) throw new Error(`no task ${id}`);
    const isCoordinator = reg.coordinator === actor;
    if (t.owner !== actor && !isCoordinator) throw new Error(`only ${t.owner} or the coordinator can update ${id}`);
    // Owners report progress; only the coordinator opens, grants, releases or
    // completes claims (C2: an owner could otherwise release its own claim).
    const OWNER_STATUSES = ["in_progress", "blocked", "review"];
    const ALL_STATUSES = [...OWNER_STATUSES, "open", "claimed", "released", "done"];
    if (o.status && !ALL_STATUSES.includes(o.status)) throw new Error(`unknown status ${o.status}`);
    if (o.status && !isCoordinator && !OWNER_STATUSES.includes(o.status)) {
      throw new Error(`only the coordinator can set status ${o.status}; owners use ${OWNER_STATUSES.join(", ")}`);
    }
    for (const k of ["status", "branch", "revision", "checkout"]) if (o[k]) t[k] = o[k];
    t.updated = now();
  } else {
    throw new Error(`unknown task operation ${op}`);
  }
  writeAtomic(path.join(dir, P.registry), renderRegistry(reg));
  return reg.tasks[id];
}

export function handoff(dir, reg, actor, o) {
  requireActor(reg, actor);
  const id = o.id || newId("H", actor);
  const fields = o.ack
    ? { "UTC time": now(), From: actor, Type: "acknowledgement", "Acknowledges": o.ack, Result: o.result || "accepted", Notes: o.message || "none" }
    : {
        "UTC time": now(), From: actor, To: o.to, Task: o.task,
        "Context revision": contextRevision(dir), "Spec revision": o.spec || "none",
        Checkout: o.checkout || "none", Branch: o.branch || "none", Revision: o.revision || "none",
        "Owned scope": o.scope || reg.tasks[o.task]?.paths?.join(", ") || "none",
        Completed: o.completed || "none", "Changed paths": o.changed || "none",
        Checks: o.checks || "none", Unresolved: o.unresolved || "none", "Next action": o.next || "none",
      };
  if (o.ack && !parseRecords(fs.readFileSync(path.join(dir, P.handoff), "utf8")).some((r) => r.id === o.ack)) {
    throw new Error(`no handoff ${o.ack}`);
  }
  const added = appendRecord(path.join(dir, P.handoff), id, formatRecord(id, fields));
  return { id, added };
}

export function contextPublish(dir, reg, actor, o) {
  requireCoordinator(reg, actor);
  const body = fs.readFileSync(path.resolve(o.file), "utf8");
  const next = contextRevision(dir) + 1;
  const text = /Context revision:\s*\d+/.test(body)
    ? body.replace(/Context revision:\s*\d+/, `Context revision: ${next}`)
    : `Context revision: ${next}\n\n${body}`;
  writeAtomic(path.join(dir, P.context), text);
  return { revision: next };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

const HELP = `agent-coord: shared coordination for Claude, Codex and other agents
State: branch ${BRANCH} on ${REMOTE}, checked out at <coordination root>/.agent-coord
Set AGENT_ID=<provider>-<role>-<session> for every write.

  setup [--create]                    check out the coordination branch (create it from templates with --create)
  read                                print context revision, registry and your unread messages (startup / before edits)
  register --provider P --role R [--team T --lead ID --tools a,b --status S --coordinator]
  post --to ID|ALL|team:T --type T --task ID --message "..." [--reply-to ID --requires-response --refs "..." --id ID]
  inbox [--advance] [--resolve ID,ID]  show unread and pending; advance the cursor; resolve handled requests
  task create|grant|transfer|release|update --id ID [--goal --owner --paths a,b --contracts c --deps d --branch --revision --status]
  handoff --to ID --task ID [--branch --revision --completed --changed --checks --unresolved --next --id ID]
  handoff --ack HANDOFF_ID [--result accepted|rejected --message "..."]
  context-publish --file PATH          coordinator only: replace PROJECT_CONTEXT.md and bump its revision
  lock-recover                         remove a lock left by a process that has stopped (check first)
  root                                 print the coordination root`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, sub] = args._;
  const cwd = process.cwd();
  const actor = process.env.AGENT_ID;
  const needActor = () => {
    if (!actor || !/^[a-z0-9]+-[a-z0-9-]+$/i.test(actor)) throw new Error("set AGENT_ID=<provider>-<role>-<session> (letters, numbers, dashes)");
    return actor;
  };
  const print = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));

  switch (cmd) {
    case "root":
      return print(coordinationRoot(cwd));
    case "setup": {
      const root = coordinationRoot(cwd);
      const dir = path.join(root, ".agent-coord");
      if (fs.existsSync(path.join(dir, ".git"))) return print(`already set up: ${dir}`);
      if (fetchBranch(root).ok && tryGit(root, ["rev-parse", "--verify", `${REMOTE}/${BRANCH}`]).ok) {
        git(root, ["worktree", "add", "--quiet", "--detach", dir, `${REMOTE}/${BRANCH}`]);
        return print(`coordination checkout ready: ${dir}`);
      }
      if (!args.create) throw new Error(`${REMOTE}/${BRANCH} does not exist; the coordinator creates it with "setup --create"`);
      git(root, ["worktree", "add", "--quiet", "--detach", dir]);
      git(dir, ["checkout", "--quiet", "--orphan", "agent-coord-init"]);
      git(dir, ["rm", "-rf", "--quiet", "."]);
      const templates = path.join(root, "docs/agents/templates");
      for (const f of ["PROJECT_CONTEXT.md", ".agent/channel.md", ".agent/handoff.md", ".agent/inboxes/README.md"]) {
        const src = path.join(templates, f.replace(/^\./, "dot-"));
        writeAtomic(path.join(dir, f), fs.readFileSync(src, "utf8"));
      }
      writeAtomic(path.join(dir, P.registry), renderRegistry(structuredClone(EMPTY_REGISTRY)));
      writeAtomic(path.join(dir, ".gitignore"), ".agent/.coordination-lock\n*.tmp\n");
      git(dir, ["add", "-A"]);
      git(dir, ["-c", "user.name=agent-coord", "-c", "user.email=agent-coord@users.noreply.github.com", "commit", "--quiet", "-m", "Create coordination state"]);
      git(dir, ["push", "--quiet", REMOTE, `HEAD:${BRANCH}`]);
      git(dir, ["checkout", "--quiet", "--detach", `HEAD`]);
      git(dir, ["branch", "--quiet", "-D", "agent-coord-init"]);
      return print(`created ${REMOTE}/${BRANCH}; checkout at ${dir}`);
    }
    case "read": {
      const snap = remoteSnapshot(ensureWorktree(cwd));
      const reg = readRegistry(snap);
      const me = actor && reg.actors[actor] ? unread(snap, reg, actor) : null;
      return print({
        contextRevision: contextRevision(snap),
        coordinator: reg.coordinator,
        actors: reg.actors,
        tasks: reg.tasks,
        unread: me?.fresh.map((r) => ({ id: r.id, ...r.fields })) ?? "register to see your messages",
        pending: me?.pending.map((r) => ({ id: r.id, ...r.fields })) ?? [],
      });
    }
    case "register":
      return print(transaction(cwd, needActor(), "register", (dir, reg) => register(dir, reg, actor, args)));
    case "post":
      if (!args.message) throw new Error("--message is required");
      return print(transaction(cwd, needActor(), `post ${args.type || "update"}`, (dir, reg) => postMessage(dir, reg, actor, args)));
    case "inbox": {
      needActor();
      if (args.advance || args.resolve) {
        return print(transaction(cwd, actor, "inbox", (dir, reg) => {
          if (args.resolve) resolveInbox(dir, actor, list(args.resolve));
          return args.advance ? advanceInbox(dir, reg, actor) : readInbox(dir, actor);
        }));
      }
      const snap = remoteSnapshot(ensureWorktree(cwd));
      const { fresh, pending } = unread(snap, readRegistry(snap), actor);
      return print({ unread: fresh.map((r) => ({ id: r.id, ...r.fields })), pending: pending.map((r) => ({ id: r.id, ...r.fields })) });
    }
    case "task":
      return print(transaction(cwd, needActor(), `task ${sub} ${args.id}`, (dir, reg) => taskOp(dir, reg, actor, sub, args)));
    case "handoff":
      return print(transaction(cwd, needActor(), args.ack ? `ack ${args.ack}` : `handoff ${args.task}`, (dir, reg) => handoff(dir, reg, actor, args)));
    case "context-publish":
      return print(transaction(cwd, needActor(), "context", (dir, reg) => contextPublish(dir, reg, actor, args)));
    case "lock-recover": {
      const file = path.join(ensureWorktree(cwd), P.lock);
      if (!fs.existsSync(file)) return print("no lock");
      const holder = JSON.parse(fs.readFileSync(file, "utf8"));
      let alive = true;
      try {
        process.kill(holder.pid, 0);
      } catch {
        alive = false;
      }
      if (alive && !args.force) throw new Error(`lock holder pid ${holder.pid} is still running; not recovering`);
      fs.unlinkSync(file);
      return print({ recovered: holder });
    }
    default:
      return print(HELP);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`agent-coord: ${err.message}`);
    process.exit(1);
  }
}
