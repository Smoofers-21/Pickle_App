// Tests for the shared agent coordination script (docs/agents/protocol.md,
// section 10). Two agents work in separate clones of a temporary bare repo,
// exactly like Claude and Codex share GitHub: no shared folder, only git.

import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimConflicts, parseRecords, pathsOverlap } from "../../scripts/agent-coord.mjs";

const run = promisify(execFile);
const SCRIPT = path.resolve("scripts/agent-coord.mjs");
const TEMPLATES = path.resolve("docs/agents/templates");
const COORD = "claude-coordinator-s1";
const CODEX = "codex-implementer-s1";
const REVIEW = "codex-reviewer-s1";

let tmp: string;
let remote: string;
let claude: string; // coordinator's clone
let codex: string; // another provider's clone
let claude2: string; // a second session of the coordinator (restart / concurrency)

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" });

const cli = (cwd: string, actor: string | null, ...args: string[]) =>
  run("node", [SCRIPT, ...args], { cwd, env: { ...process.env, AGENT_ID: actor ?? "", AGENT_COORD_ROOT: "" } }).then(
    (r) => ({ ok: true, out: r.stdout, err: r.stderr }),
    (e) => ({ ok: false, out: String(e.stdout ?? ""), err: String(e.stderr ?? "") }),
  );

const json = async (p: Promise<{ ok: boolean; out: string; err: string }>) => {
  const r = await p;
  if (!r.ok) throw new Error(r.err);
  return JSON.parse(r.out);
};

const remoteFile = (file: string) => execFileSync("git", ["show", `agents/coordination:${file}`], { cwd: remote, encoding: "utf8" });

function clone(name: string) {
  const dir = path.join(tmp, name);
  git(tmp, "clone", "--quiet", remote, dir);
  return dir;
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-coord-"));
  remote = path.join(tmp, "remote.git");
  git(tmp, "init", "--quiet", "--bare", "-b", "main", remote);
  const seed = path.join(tmp, "seed");
  git(tmp, "clone", "--quiet", remote, seed);
  fs.cpSync(TEMPLATES, path.join(seed, "docs/agents/templates"), { recursive: true });
  git(seed, "add", "-A");
  git(seed, "commit", "--quiet", "-m", "seed");
  git(seed, "push", "--quiet", "origin", "HEAD:main");

  claude = clone("claude");
  codex = clone("codex");
  claude2 = clone("claude2");
  expect((await cli(claude, COORD, "setup", "--create")).ok).toBe(true);
  for (const dir of [codex, claude2]) expect((await cli(dir, null, "setup")).ok).toBe(true);
}, 60_000);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("agent coordination", () => {
  it("registers one coordinator and lets two providers exchange and acknowledge messages", async () => {
    await json(cli(claude, COORD, "register", "--provider", "claude", "--role", "coordinator", "--team", "core", "--coordinator"));
    await json(cli(codex, CODEX, "register", "--provider", "codex", "--role", "implementer", "--team", "core", "--lead", COORD));
    const second = await cli(codex, CODEX, "register", "--coordinator");
    expect(second.ok).toBe(false);
    expect(second.err).toMatch(/coordinator already registered/);

    const q = await json(cli(codex, CODEX, "post", "--to", COORD, "--type", "question", "--task", "PROJECT", "--message", "Which branch?", "--requires-response"));
    const inbox = await json(cli(claude, COORD, "inbox"));
    expect(inbox.unread.map((m: { id: string }) => m.id)).toContain(q.id);

    await json(cli(claude, COORD, "post", "--to", CODEX, "--type", "acknowledgement", "--reply-to", q.id, "--message", "Received"));
    const box = await json(cli(claude, COORD, "inbox", "--advance"));
    expect(box.pending).toContain(q.id); // still needs an answer after the cursor moves
    const resolved = await json(cli(claude, COORD, "inbox", "--resolve", q.id));
    expect(resolved.pending).not.toContain(q.id);

    const codexInbox = await json(cli(codex, CODEX, "inbox"));
    expect(codexInbox.unread.some((m: { [k: string]: string }) => m["Reply to"] === q.id)).toBe(true);
  }, 60_000);

  it("delivers simultaneous messages from different agents without losing any", async () => {
    const posts = await Promise.all([
      json(cli(claude, COORD, "post", "--message", "one")),
      json(cli(codex, CODEX, "post", "--message", "two")),
      json(cli(claude2, COORD, "post", "--message", "three")),
    ]);
    const ids = parseRecords(remoteFile(".agent/channel.md")).map((r: { id: string }) => r.id);
    for (const p of posts) expect(ids).toContain(p.id);
  }, 60_000);

  it("turns a retried message into one record", async () => {
    await json(cli(codex, CODEX, "post", "--id", "M-retry-1", "--message", "same"));
    const again = await json(cli(codex, CODEX, "post", "--id", "M-retry-1", "--message", "same"));
    expect(again.added).toBe(false);
    const ids = parseRecords(remoteFile(".agent/channel.md")).map((r: { id: string }) => r.id);
    expect(ids.filter((id: string) => id === "M-retry-1")).toHaveLength(1);
  }, 60_000);

  it("grants one owner when overlapping claims are granted at the same time", async () => {
    await json(cli(claude, COORD, "task", "create", "--id", "T-cards", "--goal", "Option cards", "--paths", "src/app/lobby"));
    await json(cli(claude, COORD, "task", "create", "--id", "T-card-image", "--goal", "Card image", "--paths", "src/app/lobby/[code]/Card.tsx"));
    const results = await Promise.all([
      cli(claude, COORD, "task", "grant", "--id", "T-cards", "--owner", CODEX),
      cli(claude2, COORD, "task", "grant", "--id", "T-card-image", "--owner", COORD),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.err).toMatch(/scope conflict/);
  }, 60_000);

  it("only lets the coordinator grant, rejects duplicate objectives, and reuses task IDs", async () => {
    const denied = await cli(codex, CODEX, "task", "create", "--id", "T-x", "--goal", "Something");
    expect(denied.err).toMatch(/only the coordinator/);
    const dup = await cli(claude, COORD, "task", "create", "--id", "T-cards-2", "--goal", "option cards");
    expect(dup.err).toMatch(/duplicate objective/);
    const reuse = await json(cli(claude, COORD, "task", "create", "--id", "T-cards", "--goal", "Option cards"));
    expect(reuse.existed).toBe(true);
  }, 60_000);

  it("lets a reviewer post but not change claims", async () => {
    await json(cli(codex, REVIEW, "register", "--provider", "codex", "--role", "reviewer", "--team", "review", "--lead", COORD));
    expect((await cli(codex, REVIEW, "post", "--type", "proposal", "--message", "Found an issue")).ok).toBe(true);
    expect((await cli(codex, REVIEW, "task", "update", "--id", "T-cards", "--status", "done")).err).toMatch(/only/);
  }, 60_000);

  it("hands off with an acknowledgement, and rejects acks for unknown handoffs", async () => {
    const owner = (await json(cli(claude, COORD, "read"))).tasks["T-cards"].owner ?? CODEX;
    const h = await json(cli(codex, owner, "handoff", "--to", COORD, "--task", "T-cards", "--branch", "b", "--revision", "abc123",
      "--completed", "Card layout", "--checks", "npm test passed", "--next", "Review"));
    const ack = await json(cli(claude, COORD, "handoff", "--ack", h.id));
    expect(ack.added).toBe(true);
    expect((await cli(claude, COORD, "handoff", "--ack", "H-missing")).err).toMatch(/no handoff/);
  }, 60_000);

  it("ignores a partially written record and recovers a restarted session from durable state", async () => {
    // Simulate a crashed writer: an incomplete record reaches the branch.
    const dir = path.join(codex, ".agent-coord");
    git(dir, "fetch", "--quiet", "origin", "agents/coordination");
    git(dir, "reset", "--quiet", "--hard", "origin/agents/coordination");
    fs.appendFileSync(path.join(dir, ".agent/channel.md"), "\n## M-partial\n- From — x\n- To — ALL\n");
    git(dir, "commit", "--quiet", "-am", "partial");
    git(dir, "push", "--quiet", "origin", "HEAD:agents/coordination");
    expect(parseRecords(remoteFile(".agent/channel.md")).some((r: { id: string }) => r.id === "M-partial")).toBe(false);

    // A new coordinator session reads everything back from the branch.
    const state = await json(cli(claude2, COORD, "read"));
    expect(state.coordinator).toBe(COORD);
    expect(Object.keys(state.tasks)).toContain("T-cards");
    expect((await cli(claude2, COORD, "post", "--message", "after partial")).ok).toBe(true);
  }, 60_000);

  it("bumps the context revision only for the coordinator", async () => {
    const file = path.join(tmp, "ctx.md");
    fs.writeFileSync(file, "# Project context\n\nContext revision: 0\n\n## Decisions\n- D1: test\n");
    expect((await json(cli(claude, COORD, "context-publish", "--file", file))).revision).toBe(1);
    expect((await cli(codex, CODEX, "context-publish", "--file", file)).err).toMatch(/only the coordinator/);
    expect(remoteFile("PROJECT_CONTEXT.md")).toMatch(/Context revision: 1/);
  }, 60_000);
});

describe("scope helpers", () => {
  it("treats directory claims as covering their descendants", () => {
    expect(pathsOverlap("src/app", "src/app/lobby/page.tsx")).toBe(true);
    expect(pathsOverlap("src/app/", "src/app")).toBe(true);
    expect(pathsOverlap("src/app", "src/application")).toBe(false);
    const reg = { tasks: { A: { owner: "x", status: "claimed", paths: ["supabase/migrations"], contracts: ["api:state"] } } };
    expect(claimConflicts(reg, "B", ["supabase/migrations/0001.sql"])).toHaveLength(1);
    expect(claimConflicts(reg, "B", ["docs"], ["api:state"])).toHaveLength(1);
    expect(claimConflicts(reg, "B", ["docs"])).toHaveLength(0);
  });
});
