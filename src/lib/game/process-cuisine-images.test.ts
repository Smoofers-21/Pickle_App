import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const script = fileURLToPath(new URL("../../../scripts/process-cuisine-images.mjs", import.meta.url));
let cwd: string;
let input: string;
let output: string;
let manifest: string;
let photo: Buffer;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "pickle-images-"));
  input = join(cwd, "assets/restaurant-originals");
  output = join(cwd, "public/images/restaurants");
  manifest = join(cwd, "src/lib/game/cuisine-images.generated.ts");
  await Promise.all([mkdir(input, { recursive: true }), mkdir(output, { recursive: true }), mkdir(join(cwd, "src/lib/game"), { recursive: true })]);
  await writeFile(manifest, "original manifest");
  photo = await sharp({ create: { width: 30, height: 20, channels: 3, background: "green" } }).png().toBuffer();
});
afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });
const run = () => spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });

describe("cuisine image processing", () => {
  it("rejects colliding output names before writing anything", async () => {
    await writeFile(join(input, "Italian.png"), photo);
    await writeFile(join(input, "italian.jpg"), photo);
    expect(run().status).not.toBe(0);
    expect(await readdir(output)).toEqual([]);
    expect(await readFile(manifest, "utf8")).toBe("original manifest");
  });

  it("does not read a symlinked original", async () => {
    await writeFile(join(cwd, "outside.png"), photo);
    await symlink(join(cwd, "outside.png"), join(input, "italian.png"));
    expect(run().status).not.toBe(0);
  });

  it("does not overwrite a symlink target", async () => {
    await writeFile(join(input, "italian.png"), photo);
    const outside = join(cwd, "keep.txt");
    await writeFile(outside, "preserve me");
    await symlink(outside, join(output, "italian.jpg"));
    expect(run().status).not.toBe(0);
    expect(await readFile(outside, "utf8")).toBe("preserve me");
  });

  it("rejects output names that do not form safe image URLs", async () => {
    await writeFile(join(output, "italian?.jpg"), photo);
    expect(run().status).not.toBe(0);
    expect(await readFile(manifest, "utf8")).toBe("original manifest");
  });

  it("produces the documented JPEG and a deterministic manifest without metadata", async () => {
    await writeFile(join(input, "Italian.png"), photo);
    expect(run().status).toBe(0);
    const metadata = await sharp(join(output, "italian.jpg")).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: 1200, height: 800 });
    expect(metadata.exif).toBeUndefined();
    const first = await readFile(manifest, "utf8");
    expect(first).toContain('["italian"]');
    expect(run().status).toBe(0);
    expect(await readFile(manifest, "utf8")).toBe(first);
  });

  it("does not treat an unreadable originals path as an empty directory", async () => {
    await rm(input, { recursive: true });
    await writeFile(input, "not a directory");
    expect(run().status).not.toBe(0);
    expect(await readFile(manifest, "utf8")).toBe("original manifest");
  });

  it("preserves an existing output and manifest when encoding fails", async () => {
    await writeFile(join(input, "italian.png"), "invalid image");
    await writeFile(join(output, "italian.jpg"), photo);
    expect(run().status).not.toBe(0);
    expect(await readFile(join(output, "italian.jpg"))).toEqual(photo);
    expect(await readFile(manifest, "utf8")).toBe("original manifest");
    expect(await readdir(output)).toEqual(["italian.jpg"]);
  });
});
