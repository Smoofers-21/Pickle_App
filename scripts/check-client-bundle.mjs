// After `npm run build`: fails if anything that should stay on the server
// ended up in the JavaScript sent to phones. The real key values never
// exist in CI, so this checks for the names and the API endpoints, which
// would only be there if server code leaked into the browser bundle.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  "GEOAPIFY_API_KEY",
  "GOOGLE_PLACES_API_KEY",
  "TICKETMASTER_API_KEY",
  "SUPABASE_SECRET_KEY",
  "api.geoapify.com",
  "places.googleapis.com",
  "app.ticketmaster.com",
  "X-Goog-Api-Key",
].map((needle) => ({ needle, label: needle }));

// Values of secrets present in this environment (only on Vercel or locally).
for (const name of ["GEOAPIFY_API_KEY", "GOOGLE_PLACES_API_KEY", "TICKETMASTER_API_KEY", "SUPABASE_SECRET_KEY"]) {
  const value = process.env[name];
  if (value && value.length >= 12) FORBIDDEN.push({ needle: value, label: "a secret value" });
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|css|html|json|txt|map)$/.test(entry)) yield path;
  }
}

const problems = [];
let scanned = 0;
for (const file of files(".next/static")) {
  scanned += 1;
  const text = readFileSync(file, "utf8");
  for (const { needle, label } of FORBIDDEN) {
    if (text.includes(needle)) {
      problems.push(`${file}: contains ${label}`);
    }
  }
}
if (scanned === 0) {
  console.error("No browser assets found. Run npm run build before checking the bundle.");
  process.exit(1);
}

if (problems.length) {
  console.error("Server-only values found in the browser bundle:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("Browser bundle check passed: no server-only names, endpoints or key values.");
