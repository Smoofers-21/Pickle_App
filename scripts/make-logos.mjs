// Makes every logo and icon file from the owner's original logo PNG.
//
// The product spec says the logo is used exactly as supplied: these files are
// made ONLY by trimming, cropping and resizing public/logo/pickle-logo.png,
// then placing the result on white where a solid background is needed.
// Nothing is redrawn or recolored.
//
// Run with: npm run logos

import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = "public/logo/pickle-logo.png";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
// Pixels at or below this alpha count as empty when trimming.
const ALPHA_EMPTY = 8;

const { data, info } = await sharp(SOURCE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const alphaAt = (x, y) => data[(y * width + x) * channels + 3];

function rowHasInk(y, x0 = 0, x1 = width - 1) {
  for (let x = x0; x <= x1; x++) if (alphaAt(x, y) > ALPHA_EMPTY) return true;
  return false;
}
function colHasInk(x, y0, y1) {
  for (let y = y0; y <= y1; y++) if (alphaAt(x, y) > ALPHA_EMPTY) return true;
  return false;
}

// Bounding box of everything visible between rows y0 and y1.
function inkBox(y0, y1) {
  while (y0 < y1 && !rowHasInk(y0)) y0++;
  while (y1 > y0 && !rowHasInk(y1)) y1--;
  let x0 = 0;
  let x1 = width - 1;
  while (x0 < x1 && !colHasInk(x0, y0, y1)) x0++;
  while (x1 > x0 && !colHasInk(x1, y0, y1)) x1--;
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// Full logo (ballot box, pickle and wordmark) with the empty margins trimmed.
const full = inkBox(0, height - 1);

// Icon version: the ballot box and pickle only. It ends at the first empty
// row of the gap that separates the drawing from the "Pickle" wordmark.
let gap = full.top;
while (gap < full.top + full.height && rowHasInk(gap)) gap++;
const icon = inkBox(full.top, gap - 1);

const crop = (box) => sharp(SOURCE).extract(box);

await mkdir("public/icons", { recursive: true });

// Trimmed full logo, 600 px wide, for the home screen (shown about 200 px
// wide, so it stays sharp on 3x screens).
await crop(full).resize({ width: 600 }).png().toFile("public/logo/pickle-logo-home.png");

// Places a cropped logo, resized to fit inside maxW x maxH, centered on a
// white canvas.
async function onWhite(box, canvasW, canvasH, maxW, maxH, out) {
  const art = await crop(box)
    .resize({ width: Math.round(maxW), height: Math.round(maxH), fit: "inside" })
    .png()
    .toBuffer();
  const meta = await sharp(art).metadata();
  await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: WHITE } })
    .composite([
      {
        input: art,
        left: Math.round((canvasW - meta.width) / 2),
        top: Math.round((canvasH - meta.height) / 2),
      },
    ])
    .flatten({ background: WHITE })
    .png()
    .toFile(out);
}

// Home-screen icons: Android crops icons to a circle or rounded shape whose
// safe zone is the central circle 80% wide. Fitting the icon's diagonal inside
// 76% of the square keeps it clear of every mask.
const diagonal = Math.hypot(icon.width, icon.height);
for (const size of [180, 192, 512]) {
  const scale = (0.76 * size) / diagonal;
  const out = size === 180 ? "public/icons/apple-touch-icon.png" : `public/icons/icon-${size}.png`;
  await onWhite(icon, size, size, icon.width * scale, icon.height * scale, out);
}

// Browser tab icons: small, so the icon fills most of the square.
for (const size of [16, 32]) {
  await onWhite(icon, size, size, size * 0.92, size * 0.92, `public/icons/favicon-${size}.png`);
}

// Link preview image (1200 x 630) with the full logo on white. The logo is
// 400 px tall, leaving 115 px above and below: more than the pickle's height,
// as the spec's clear-space rule requires.
await onWhite(full, 1200, 630, 1000, 400, "public/og-image.png");

console.log("full logo crop:", full);
console.log("icon crop:", icon);
