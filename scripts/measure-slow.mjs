// Measures how long the main pages take to load on slow phone networks
// (milestone 9, "speed on a slow connection"). Runs the production build
// (`npm run build` first) with API answers mocked, so it needs no database
// or keys. Prints numbers rather than passing or failing: networks vary.
//
//   npm run measure:slow
//
// Profiles match Chrome DevTools' "Slow 3G" and "Fast 3G" presets.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("Skipped: Playwright is not installed here.");
  process.exit(0);
}
if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build: run npm run build first.");
  process.exit(1);
}

const PROFILES = {
  "Slow 3G": { latency: 400, downloadThroughput: (500 * 1024 * 0.8) / 8, uploadThroughput: (500 * 1024 * 0.8) / 8 },
  "Fast 3G": { latency: 150, downloadThroughput: (1.6 * 1024 * 1024 * 0.9) / 8, uploadThroughput: (750 * 1024 * 0.9) / 8 },
};
const PAGES = { Home: "/", "Enter code": "/join", Lobby: "/lobby/AAAAAA" };
const PORT = 3600 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}`;

const server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore" });
try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${BASE}/`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch();
  console.log("Network   Page        Ready (s)  Transferred (KB)");
  for (const [profile, conditions] of Object.entries(PROFILES)) {
    for (const [name, path] of Object.entries(PAGES)) {
      const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
      const page = await context.newPage();
      await page.route("**/api/**", (r) => r.fulfill({ contentType: "application/json", body: '{"status":"not_found"}' }));
      const cdp = await context.newCDPSession(page);
      let bytes = 0;
      cdp.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, ...conditions });
      const start = Date.now();
      await page.goto(BASE + path, { waitUntil: "load" });
      const seconds = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`${profile.padEnd(9)} ${name.padEnd(11)} ${seconds.padStart(9)}  ${String(Math.round(bytes / 1024)).padStart(16)}`);
      await context.close();
    }
  }
  await browser.close();
} finally {
  server.kill();
}
