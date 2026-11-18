// Makes the screenshots in docs/readme/ for the README: the production build
// (`npm run build` first) with every API answer mocked, at phone size. The
// places are made up; no database, keys or network needed.
//
//   node scripts/readme-screenshots.mjs

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build: run npm run build first.");
  process.exit(1);
}
const OUT = "docs/readme";
mkdirSync(OUT, { recursive: true });

const members = [
  { id: "m1", name: "Sam", isHost: true, isDemo: false },
  { id: "m2", name: "Ana", isHost: false, isDemo: false },
  { id: "m3", name: "Ben", isHost: false, isDemo: false },
  { id: "m4", name: "Jo", isHost: false, isDemo: false },
];
const me = { id: "m1", name: "Sam", isHost: true };
const place = (id, name, kind, img, distanceMi, address, openNow, extra = {}) => ({
  id, name, kind, distanceMi, address, link: null, openNow, image: { src: `/images/restaurants/${img}.jpg`, illustrative: true },
  venue: null, startTime: null, source: "geoapify", ...extra,
});
const options = [
  place("a", "Luna Trattoria", "Italian", "italian", 0.6, "12 W Center St", true),
  place("b", "Taqueria El Sol", "Mexican", "mexican", 1.1, "408 N College Ave", true),
  place("c", "Sakura House", "Sushi", "sushi", 1.4, "220 S School Ave", true),
  place("d", "Copper Pot Pizza", "Pizza", "pizza", 0.9, "31 E Dickson St", null),
  place("e", "Saffron Grill", "Indian", "indian", 2.3, "1550 N Garland Ave", true),
  place("f", "Harbor Fish Co.", "Seafood", "seafood", 3.0, "700 S Main St", false),
];
const game = (stage, extra = {}) => ({
  id: "g1", stage, category: "food", eventDate: null, radiusMi: 5, age: "all", indoorOutdoor: "either",
  roundsTotal: 2, currentRound: 1, search: { status: "done", radiusMi: 5, matches: 9, widenedTo: null, reason: null }, ...extra,
});
const base = {
  status: "ok", lobby: { id: "l1", code: "K7PQ4M", status: "locked", isDemo: false }, me, members, maxMembers: 10,
  game: null, picksDone: [], myPicks: null, demoPending: false, options: [], votesDone: [], myVote: null,
};
const shots = {
  "01-home": { path: "/" },
  "02-lobby": { state: { ...base, lobby: { ...base.lobby, status: "open" } } },
  "03-picks": { state: { ...base, game: game("picks", { search: null }), picksDone: ["m2", "m3"] } },
  "04-cards": { state: { ...base, game: game("cards_and_voting"), options } },
  "05-rank": {
    state: { ...base, game: game("cards_and_voting"), options },
  },
  "06-results": {
    state: {
      ...base,
      game: game("results", { currentRound: 2 }),
      options: [options[1], options[0], options[2]].map((o, i) => ({ ...o, place: i + 1 })),
    },
  },
};

const PORT = 3500 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore" });
try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${BASE}/`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch();
  for (const [name, shot] of Object.entries(shots)) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    if (shot.state) {
      await page.route("**/api/lobbies/K7PQ4M/state", (r) =>
        r.fulfill({ contentType: "application/json", body: JSON.stringify(shot.state) }),
      );
    }
    await page.goto(BASE + (shot.path ?? "/lobby/K7PQ4M"));
    await page.waitForLoadState("networkidle");
    if (name === "05-rank") {
      for (let i = 0; i < options.length - 1; i++) await page.getByRole("button", { name: "Next option" }).first().click();
      await page.getByRole("button", { name: /Go vote/ }).click();
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`${OUT}/${name}.png`);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
