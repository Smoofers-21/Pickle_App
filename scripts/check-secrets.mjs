// Pre-commit secret check. Blocks a commit that contains an API key, a
// Supabase secret key, a private key or a .env file.
//
// It runs gitleaks too when gitleaks is installed (https://github.com/gitleaks/gitleaks),
// and always runs the built-in checks below, so it works on any machine.
// GitHub Actions also runs gitleaks on every push (.github/workflows/ci.yml).

import { execFileSync, spawnSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const problems = [];

// 1. No .env files (only .env.example, which holds no values).
const staged = git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
  .split("\n")
  .filter(Boolean);
for (const file of staged) {
  const name = file.split("/").pop();
  if (/^\.env(\..*)?$/.test(name) && name !== ".env.example") {
    problems.push(`${file}: .env files hold secrets and must not be committed`);
  }
}

// 2. Known key formats in the lines being added.
const patterns = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Supabase secret key", /sb_secret_[0-9A-Za-z_-]{16,}/],
  ["JWT (for example a legacy Supabase key)", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  [
    "Secret setting with a value",
    /\b(SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|GOOGLE_PLACES_API_KEY|TICKETMASTER_API_KEY)\s*[=:]\s*["']?[A-Za-z0-9_-]{12,}/,
  ],
];

let currentFile = "";
for (const line of git("diff", "--cached", "-U0", "--no-color").split("\n")) {
  if (line.startsWith("+++ ")) {
    currentFile = line.replace(/^\+\+\+ b\//, "");
    continue;
  }
  if (!line.startsWith("+")) continue;
  for (const [label, regex] of patterns) {
    if (regex.test(line)) problems.push(`${currentFile}: looks like a ${label}`);
  }
}

// 3. gitleaks, when installed.
const gitleaks = spawnSync("gitleaks", ["git", "--pre-commit", "--staged", "--redact", "--no-banner"], {
  stdio: "inherit",
});
if (gitleaks.error?.code === "ENOENT") {
  // Not installed: the built-in checks above still ran.
} else if (gitleaks.status !== 0) {
  problems.push("gitleaks found a possible secret (details above)");
}

if (problems.length > 0) {
  console.error("\nCommit blocked: possible secrets found.\n");
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  console.error(
    "\nRemove the secret and put it in Vercel's environment settings (or .env.local) instead.\n" +
      "If a real key was ever committed or pushed, rotate it in that service's console today.\n",
  );
  process.exit(1);
}
