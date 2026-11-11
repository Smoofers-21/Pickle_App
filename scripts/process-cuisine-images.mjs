// Turns the photos in assets/restaurant-originals/ into the cuisine images
// cards use: cropped to 3:2, 1200 × 800, compressed JPEG, in
// public/images/restaurants/. Run with: npm run images

import sharp from "sharp";
import { readdir, mkdir, writeFile, lstat, rename, rm } from "node:fs/promises";
import { extname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";

const IN = "assets/restaurant-originals";
const OUT = "public/images/restaurants";
const MANIFEST = "src/lib/game/cuisine-images.generated.ts";
const safeName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function directory(path, allowMissing = false) {
  try {
    if (!(await lstat(path)).isDirectory()) throw new Error(`Expected a regular directory: ${path}`);
    return await readdir(path, { withFileTypes: true });
  } catch (err) {
    if (allowMissing && err.code === "ENOENT") return [];
    throw err;
  }
}

await mkdir(OUT, { recursive: true });
const inputs = await directory(IN, true);
const outputs = await directory(OUT);
const files = inputs.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
const names = new Set();
// Validate the entire file list before overwriting any existing photos.
for (const file of files) {
  const name = basename(file.name, extname(file.name)).toLowerCase();
  if (!file.isFile() || !safeName.test(name)) throw new Error(`Use a regular image file with a simple cuisine name: ${file.name}`);
  if (names.has(name)) throw new Error(`More than one original would write ${name}.jpg`);
  names.add(name);
}
for (const file of outputs.filter((f) => /\.jpg$/i.test(f.name))) {
  const name = file.name.slice(0, -4);
  if (!file.isFile() || !safeName.test(name) || !file.name.endsWith(".jpg")) {
    throw new Error(`Use a regular lowercase cuisine-name.jpg output: ${file.name}`);
  }
}
if (files.length === 0) console.log(`No photos in ${IN}/ yet. See ${OUT}/README.md for the list.`);
for (const file of files) {
  const name = basename(file.name, extname(file.name)).toLowerCase();
  const out = join(OUT, `${name}.jpg`);
  const temporary = join(OUT, `.${name}-${randomUUID()}.tmp`);
  try {
    const info = await sharp(join(IN, file.name))
      .rotate()
      .resize(1200, 800, { fit: "cover", position: "attention" })
      .jpeg({ quality: 74, mozjpeg: true })
      .toFile(temporary);
    await rename(temporary, out);
    console.log(`${out}  ${Math.round(info.size / 1024)} KB`);
  } finally {
    await rm(temporary, { force: true });
  }
}
// Tell the app which images exist, so cards fall back correctly.
const present = (await readdir(OUT)).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4)).sort();
const temporary = `${MANIFEST}.${randomUUID()}.tmp`;
try {
  await writeFile(temporary,
    `// Written by \`npm run images\`. The cuisine images present in\n// public/images/restaurants/ (file names without .jpg).\nexport const AVAILABLE_CUISINE_IMAGES: ReadonlySet<string> = new Set<string>(${JSON.stringify(present)});\n`,
    { flag: "wx" },
  );
  await rename(temporary, MANIFEST);
} finally {
  await rm(temporary, { force: true });
}
console.log(`Library: ${present.length} images.`);
console.log("\nRemember to add a row to public/images/restaurants/CREDITS.md for each new photo.");
