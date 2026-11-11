import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("../../../scripts/check-client-bundle.mjs", import.meta.url));
let cwd: string;
let assets: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "pickle-bundle-"));
  assets = join(cwd, ".next/static");
  await mkdir(assets, { recursive: true });
});
afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });
const run = (extraEnv: Record<string, string> = {}) => spawnSync(process.execPath, [script], {
  cwd, encoding: "utf8", env: { ...process.env, ...extraEnv },
});

describe("browser bundle secret check", () => {
  it("rejects a secret without echoing its value", async () => {
    const marker = "synthetic-review!";
    await writeFile(join(assets, "example.js"), JSON.stringify(marker));
    const result = run({ GEOAPIFY_API_KEY: marker });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("a secret value");
    expect(result.stderr + result.stdout).not.toContain(marker);
  });

  it("scans browser source maps", async () => {
    await writeFile(join(assets, "example.js.map"), JSON.stringify({ sourcesContent: ["GEOAPIFY_API_KEY"] }));
    expect(run().status).not.toBe(0);
  });

  it("does not pass when there are no browser assets", () => {
    expect(run().status).not.toBe(0);
  });

  it("retains legacy Google key value checks", async () => {
    const marker = "legacy-synthetic!";
    await writeFile(join(assets, "example.js"), JSON.stringify(marker));
    expect(run({ GOOGLE_PLACES_API_KEY: marker }).status).not.toBe(0);
  });

  it("passes ordinary browser assets", async () => {
    await writeFile(join(assets, "example.js"), "console.log('hello')");
    expect(run().status).toBe(0);
  });
});
