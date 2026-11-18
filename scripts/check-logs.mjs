// Checks that the app's own log messages can't contain IP addresses, keys,
// locations or member data (milestone 9; build plan, "Security and privacy").
//
// Every console call in src/ (tests aside) must log only fixed text, the
// request path (a lobby code at most) and errorLabel(err) (an error's name
// and database code, never its message). A new log line fails this check
// until it is written that way.
//
//   npm run check:logs        (also a step of npm run check:all)
//   node scripts/check-logs.mjs <dir>   (check another folder; used by its tests)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_ARG = [
  /^"[^"]*"$/, // fixed text
  /^request\.nextUrl\.pathname$/,
  /^errorLabel\(err\)$/,
  /^`[^`$]*(\$\{errorLabel\(err\)\}[^`$]*)*`$/, // fixed text around errorLabel(err)
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** Splits "a, f(b, c), `x`" into top-level arguments. */
function args(text) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

/** The text between the call's parentheses. */
function callArgs(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return "";
}

const problems = [];
let calls = 0;
const ROOT = process.argv[2] ?? "src";
for (const file of files(ROOT)) {
  const src = readFileSync(file, "utf8");
  // Only plain console.method(...) calls can be checked; any other use of
  // console (console["error"], console.warn?.(), passing console around)
  // fails outright (Codex, PR 27).
  for (const m of src.matchAll(/\bconsole\b(?!\.\w+\s*\()/g)) {
    const line = src.slice(0, m.index).split("\n").length;
    problems.push(`${file}:${line}: write log calls as console.method(...) so they can be checked`);
  }
  for (const m of src.matchAll(/\bconsole\.(\w+)\s*\(/g)) {
    calls++;
    const line = src.slice(0, m.index).split("\n").length;
    for (const arg of args(callArgs(src, m.index + m[0].length - 1))) {
      if (!ALLOWED_ARG.some((re) => re.test(arg))) problems.push(`${file}:${line}: console.${m[1]} logs \`${arg}\``);
    }
  }
}

if (problems.length) {
  console.error("Log lines that could leak IPs, keys or member data:");
  for (const p of problems) console.error(`  ${p}`);
  console.error("Log only fixed text, request.nextUrl.pathname and errorLabel(err).");
  process.exit(1);
}
console.log(`Log check passed: ${calls} log calls, all fixed text, paths and error labels`);
