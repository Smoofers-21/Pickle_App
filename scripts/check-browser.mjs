// Browser regressions for bugs that only show in a real browser, mostly
// from Next.js keeping pages you've left alive but hidden (Activity).
// Runs the production build (`npm run build` first) with every API answer
// mocked in the browser: no database, keys or network needed.
//
//   npm run check:browser        (also a step of npm run check:all)
//
// Skips, with a note, where Playwright isn't installed (it isn't a project
// dependency; the Claude and Codex environments have it).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("Browser checks skipped: Playwright is not installed here.");
  process.exit(0);
}
if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build: run npm run build first.");
  process.exit(1);
}

const PORT = 3190 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}`;

// ---- Mocked server answers -------------------------------------------------

const host = { id: "m1", name: "Host", isHost: true };
const ana = { id: "m2", name: "Ana", isHost: false };
const members = [
  { id: "m1", name: "Host", isHost: true, isDemo: false },
  { id: "m2", name: "Ana", isHost: false, isDemo: false },
];
const option = (id, place) => ({
  id, name: `Place ${id}`, kind: "Restaurant", distanceMi: 1, address: "1 Main St", link: null, openNow: null,
  image: null, venue: null, startTime: null, source: "geoapify", place,
});
const lobby = (code, me) => ({
  status: "ok", lobby: { id: `l-${code}`, code, status: "open", isDemo: false }, me, members, maxMembers: 10,
  game: null, picksDone: [], myPicks: null, demoPending: false, options: [], votesDone: [], myVote: null,
});
const results = (code, me) => ({
  ...lobby(code, me),
  lobby: { id: `l-${code}`, code, status: "locked", isDemo: false },
  game: { id: "g1", stage: "results", category: "food", eventDate: null, radiusMi: 5, age: "all", indoorOutdoor: "either", roundsTotal: 1, currentRound: 1, search: null },
  options: [option("a", 1), option("b", 2)],
});
const reply = (route, body, raw = false) =>
  route.fulfill({ status: 200, contentType: "application/json", body: raw ? body : JSON.stringify(body) });

/** A response held until `release(body)` is called. */
function held() {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  return { release, handler: async (route) => reply(route, await gate) };
}

const openDialogs = (page) =>
  page.evaluate(() => [...document.querySelectorAll("dialog")].filter((d) => d.open).map((d) => d.innerText.split("\n")[0]));
const visibleText = (page) =>
  page.evaluate(() => [...document.querySelectorAll("main")].filter((m) => m.getClientRects().length).map((m) => m.innerText).join("\n"));
const path = (page) => new URL(page.url()).pathname;

// ---- Checks ----------------------------------------------------------------

const checks = {
  async "new lobby after Change lobby takes taps (no hidden open dialog)"(page) {
    await page.route("**/api/lobbies/AAAAAA/state", (r) => reply(r, results("AAAAAA", host)));
    await page.route("**/api/lobbies/AAAAAA/change", (r) => reply(r, { code: "BBBBBB" }));
    await page.route("**/api/lobbies/BBBBBB/state", (r) => reply(r, lobby("BBBBBB", host)));
    await page.goto(`${BASE}/lobby/AAAAAA`);
    await page.getByRole("button", { name: "Change lobby" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Change lobby" }).click();
    await page.getByText("New lobby", { exact: true }).waitFor();
    const open = await openDialogs(page);
    if (open.length) throw new Error(`dialog still open: ${open}`);
    await page.getByRole("button", { name: /Ana/ }).click({ timeout: 3000 });
    if (!(await openDialogs(page)).includes("Remove Ana?")) throw new Error("tapping a member did nothing");
  },

  async "joining after opening the lobby link lands in the lobby"(page) {
    let joined = false;
    await page.route("**/api/lobbies/CCCCCC/*", (r) => {
      const what = new URL(r.request().url()).pathname.split("/").pop();
      if (what === "check") return reply(r, { result: "ok" });
      if (what === "join") {
        joined = true;
        return reply(r, { name: "Ana", renamed: false, memberId: "m2" });
      }
      return reply(r, joined ? lobby("CCCCCC", ana) : { status: "not_member" });
    });
    await page.goto(`${BASE}/lobby/CCCCCC`);
    await page.waitForURL("**/join/CCCCCC");
    await page.locator("#name:visible").fill("Ana");
    await page.locator("#name:visible").press("Enter");
    await page.waitForURL("**/lobby/CCCCCC");
    await page.getByText("Waiting for Host to start").waitFor();
    await page.waitForTimeout(1000);
    if (path(page) !== "/lobby/CCCCCC") throw new Error(`bounced to ${path(page)}`);
  },

  async "a late Change lobby answer doesn't move a page you left"(page) {
    const change = held();
    await page.route("**/api/lobbies/DDDDDD/state", (r) => reply(r, results("DDDDDD", host)));
    await page.route("**/api/lobbies/DDDDDD/change", change.handler);
    await page.goto(`${BASE}/new`);
    await page.goto(`${BASE}/lobby/DDDDDD`);
    await page.getByRole("button", { name: "Change lobby" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Change lobby" }).click();
    await page.goBack();
    change.release({ code: "BBBBBB" });
    await page.waitForTimeout(1500);
    if (path(page) !== "/new") throw new Error(`pulled to ${path(page)}`);
  },

  async "a late code check doesn't move a page you left"(page) {
    const check = held();
    await page.route("**/api/lobbies/EEEEEE/check", check.handler);
    await page.goto(`${BASE}/join`);
    await page.locator("input:visible").first().pressSequentially("EEEEEE");
    await page.getByRole("link", { name: /back/i }).first().click();
    await page.waitForURL(`${BASE}/`);
    check.release({ result: "member" });
    await page.waitForTimeout(1500);
    if (path(page) !== "/") throw new Error(`pulled to ${path(page)}`);
  },

  async "Create sends one request however often you press Enter"(page) {
    let creates = 0;
    const create = held();
    await page.route("**/api/lobbies", (r) => {
      creates += 1;
      return create.handler(r);
    });
    await page.goto(`${BASE}/new`);
    await page.locator("#name:visible").fill("Sam");
    await page.locator("#name:visible").press("Enter");
    await page.locator("#name:visible").press("Enter").catch(() => {});
    await page.waitForTimeout(300);
    create.release({ code: "GGGGGG", memberId: "m1", name: "Sam" });
    if (creates !== 1) throw new Error(`${creates} create requests`);
  },

  async "broken or contract-breaking state answers show an error, not a crash"(page) {
    const bodies = ['{"status":"ok","me":', JSON.stringify({ ...lobby("HHHHHH", host), members: [null] })];
    for (const body of bodies) {
      await page.unroute("**/api/lobbies/HHHHHH/state");
      await page.route("**/api/lobbies/HHHHHH/state", (r) => reply(r, body, true));
      await page.goto(`${BASE}/lobby/HHHHHH`);
      await page.waitForTimeout(800);
      if (!(await visibleText(page)).includes("Something went wrong")) throw new Error(`no error shown for ${body.slice(0, 30)}`);
    }
  },
};

// ---- Run -------------------------------------------------------------------

const server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore" });
let failed = 0;
try {
  for (let i = 0; i < 60; i++) {
    const up = await fetch(`${BASE}/`).then((r) => r.ok, () => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch();
  for (const [name, run] of Object.entries(checks)) {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10_000);
    try {
      await run(page);
      if (errors.length) throw new Error(`page error: ${errors[0]}`);
      console.log(`ok - ${name}`);
    } catch (e) {
      failed += 1;
      console.log(`FAILED - ${name}: ${e.message.split("\n")[0]}`);
    }
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
if (failed) {
  console.log(`Browser checks: ${failed} failed`);
  process.exit(1);
}
console.log(`Browser check passed: ${Object.keys(checks).length} scenarios`);
