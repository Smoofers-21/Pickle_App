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

  async "a demo host picks a demo location instead of sharing theirs"(page) {
    let sent = null;
    await page.route("**/api/lobbies/JJJJJJ/state", (r) =>
      reply(r, { ...lobby("JJJJJJ", host), lobby: { id: "l-J", code: "JJJJJJ", status: "open", isDemo: true } }),
    );
    await page.route("**/api/lobbies/JJJJJJ/start", (r) => {
      sent = r.request().postDataJSON();
      return reply(r, { status: "ok" });
    });
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = () => {
        throw new Error("asked for the phone's location");
      };
    });
    await page.goto(`${BASE}/lobby/JJJJJJ`);
    await page.getByRole("button", { name: /Set up the game/ }).click();
    const select = page.getByLabel("Demo location");
    const choices = await select.locator("option").allTextContents();
    if (choices.join("|") !== "Fayetteville, AR|Los Angeles, CA") throw new Error(`choices: ${choices}`);
    await select.selectOption("los_angeles");
    await page.getByRole("button", { name: "Food" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.waitForTimeout(800);
    if (!sent || sent.demoArea !== "los_angeles" || "lat" in sent) throw new Error(`sent ${JSON.stringify(sent)}`);
  },

  async "a lobby that can't load offers Try again, which recovers"(page) {
    let fail = true;
    await page.route("**/api/lobbies/KKKKKK/state", (r) => (fail ? r.abort("internetdisconnected") : reply(r, lobby("KKKKKK", host))));
    await page.goto(`${BASE}/lobby/KKKKKK`);
    await page.getByText("No connection", { exact: true }).waitFor();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("Ana", { exact: false }).first().waitFor();
  },

  async "losing the connection mid-game shows a bar that clears when it's back"(page) {
    await page.route("**/api/lobbies/LLLLLL/state", (r) => reply(r, lobby("LLLLLL", host)));
    await page.goto(`${BASE}/lobby/LLLLLL`);
    await page.getByRole("button", { name: /Ana/ }).waitFor();
    await page.context().setOffline(true);
    await page.getByText("Showing the last update. Trying again…").waitFor();
    if (!(await page.getByRole("button", { name: /Ana/ }).isVisible())) throw new Error("the lobby vanished while offline");
    await page.context().setOffline(false);
    await page.getByText("Showing the last update. Trying again…").waitFor({ state: "detached", timeout: 8000 });
  },

  async "a slow first load says so"(page) {
    const state = held();
    await page.route("**/api/lobbies/MMMMMM/state", state.handler);
    await page.goto(`${BASE}/lobby/MMMMMM`);
    await page.getByText("Loading the lobby…").waitFor();
    await page.getByText(/Your connection may be slow/).waitFor({ timeout: 10_000 });
    state.release(lobby("MMMMMM", host));
    await page.getByRole("button", { name: /Ana/ }).waitFor();
  },

  async "a failed load after joining through the lobby link offers Try again"(page) {
    // The page keeps its old "not a member" answer from before joining; a
    // failed load afterwards must still be reported (Codex, PR 27).
    let joined = false;
    let fail = true;
    await page.route("**/api/lobbies/NNNNNN/*", (r) => {
      const what = new URL(r.request().url()).pathname.split("/").pop();
      if (what === "check") return reply(r, { result: "ok" });
      if (what === "join") {
        joined = true;
        return reply(r, { name: "Ana", renamed: false, memberId: "m2" });
      }
      if (!joined) return reply(r, { status: "not_member" });
      return fail ? r.abort("internetdisconnected") : reply(r, lobby("NNNNNN", ana));
    });
    await page.goto(`${BASE}/lobby/NNNNNN`);
    await page.waitForURL("**/join/NNNNNN");
    await page.locator("#name:visible").fill("Ana");
    await page.locator("#name:visible").press("Enter");
    await page.waitForURL("**/lobby/NNNNNN");
    await page.getByRole("button", { name: "Try again" }).waitFor();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("Waiting for Host to start").waitFor();
  },

  async "a slow load after joining through the lobby link says so"(page) {
    let joined = false;
    const state = held();
    await page.route("**/api/lobbies/PPPPPP/*", (r) => {
      const what = new URL(r.request().url()).pathname.split("/").pop();
      if (what === "check") return reply(r, { result: "ok" });
      if (what === "join") {
        joined = true;
        return reply(r, { name: "Ana", renamed: false, memberId: "m2" });
      }
      return joined ? state.handler(r) : reply(r, { status: "not_member" });
    });
    await page.goto(`${BASE}/lobby/PPPPPP`);
    await page.waitForURL("**/join/PPPPPP");
    await page.locator("#name:visible").fill("Ana");
    await page.locator("#name:visible").press("Enter");
    await page.waitForURL("**/lobby/PPPPPP");
    await page.getByText(/Your connection may be slow/).waitFor({ timeout: 10_000 });
    state.release(lobby("PPPPPP", ana));
    await page.getByText("Waiting for Host to start").waitFor();
  },

  async "the No connection bar shows on picks and setup, and drafts survive"(page) {
    const picks = { ...lobby("QQQQQQ", host), game: { ...results("QQQQQQ", host).game, stage: "picks" }, options: [] };
    let body = picks;
    await page.route("**/api/lobbies/QQQQQQ/state", (r) => reply(r, body));
    const bar = page.getByText("Showing the last update. Trying again…");
    const offlineAndBack = async () => {
      await page.context().setOffline(true);
      await bar.waitFor();
      await page.context().setOffline(false);
      await bar.waitFor({ state: "detached", timeout: 8000 });
    };

    // Picks: a chosen tag stays chosen.
    await page.goto(`${BASE}/lobby/QQQQQQ`);
    const italian = page.getByRole("button", { name: "Italian", exact: true }).first();
    await italian.click();
    await offlineAndBack();
    if ((await italian.getAttribute("aria-pressed")) !== "true") throw new Error("the picks draft was lost");

    // Host setup: the chosen category stays chosen.
    body = lobby("QQQQQQ", host);
    await page.reload();
    await page.getByRole("button", { name: /Set up the game/ }).click();
    const food = page.getByRole("button", { name: "Food" });
    await food.click();
    await offlineAndBack();
    if ((await food.getAttribute("aria-pressed")) !== "true") throw new Error("the setup draft was lost");
  },

  async "the /demo link makes a lobby with demo friends and says what to do"(page) {
    let demoAdded = false;
    await page.route("**/api/lobbies", (r) => reply(r, { code: "RRRRRR", memberId: "m1", name: "Sam" }));
    await page.route("**/api/lobbies/RRRRRR/demo", (r) => {
      demoAdded = true;
      return reply(r, { status: "ok" });
    });
    const demoFriends = ["Maya", "Jordan", "Sam 2"].map((name, i) => ({ id: `d${i}`, name, isHost: false, isDemo: true }));
    await page.route("**/api/lobbies/RRRRRR/state", (r) =>
      reply(r, {
        ...lobby("RRRRRR", host),
        lobby: { id: "l-R", code: "RRRRRR", status: "open", isDemo: true },
        members: [members[0], ...demoFriends],
      }),
    );
    await page.goto(`${BASE}/demo`);
    await page.getByText("Try Pickle", { exact: true }).waitFor();
    await page.locator("#name:visible").fill("Sam");
    await page.getByRole("button", { name: /Start the demo/ }).click();
    await page.waitForURL("**/lobby/RRRRRR");
    await page.getByText("Maya, Jordan and Sam 2 are simulated", { exact: false }).waitFor();
    if (!demoAdded) throw new Error("demo friends were never added");
    if (await page.getByRole("button", { name: "Add demo friends" }).count()) throw new Error("still offers Add demo friends");
  },

  async "broken or contract-breaking state answers show an error, not a crash"(page) {
    const bodies = ['{"status":"ok","me":', JSON.stringify({ ...lobby("HHHHHH", host), members: [null] })];
    for (const body of bodies) {
      await page.unroute("**/api/lobbies/HHHHHH/state");
      await page.route("**/api/lobbies/HHHHHH/state", (r) => reply(r, body, true));
      await page.goto(`${BASE}/lobby/HHHHHH`);
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Try again" }).waitFor();
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
