// Turns the photos in assets/restaurant-originals/ into the cuisine images
// cards use: cropped to 3:2, 1200 × 800, compressed JPEG, in
// public/images/restaurants/. Run with: npm run images

import sharp from "sharp";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { extname, basename, join } from "node:path";

const IN = "assets/restaurant-originals";
const OUT = "public/images/restaurants";

await mkdir(OUT, { recursive: true });
const files = (await readdir(IN).catch(() => [])).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (files.length === 0) console.log(`No photos in ${IN}/ yet. See ${OUT}/README.md for the list.`);
for (const file of files) {
  const name = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const out = join(OUT, `${name}.jpg`);
  const info = await sharp(join(IN, file))
    .rotate()
    .resize(1200, 800, { fit: "cover", position: "attention" })
    .jpeg({ quality: 74, mozjpeg: true })
    .toFile(out);
  console.log(`${out}  ${Math.round(info.size / 1024)} KB`);
}
// Tell the app which images exist, so cards fall back correctly.
const present = (await readdir(OUT)).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4)).sort();
await writeFile(
  "src/lib/game/cuisine-images.generated.ts",
  `// Written by \`npm run images\`. The cuisine images present in\n// public/images/restaurants/ (file names without .jpg).\nexport const AVAILABLE_CUISINE_IMAGES: ReadonlySet<string> = new Set<string>(${JSON.stringify(present)});\n`,
);
console.log(`Library: ${present.length} images.`);
console.log("\nRemember to add a row to public/images/restaurants/CREDITS.md for each new photo.");
