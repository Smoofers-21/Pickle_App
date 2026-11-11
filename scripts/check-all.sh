#!/usr/bin/env bash
# Every check this repo has, in CI order, with a one-line summary each.
# Run before every push:  npm run check:all
# Stops at the first failure and shows its output.
set -uo pipefail
cd "$(dirname "$0")/.."

declare -a results=()
step() {
  local name="$1"; shift
  local log; log="$(mktemp)"
  if "$@" >"$log" 2>&1; then
    local detail; detail="$(grep -E 'Tests +[0-9]+ passed|SQL checks passed|check passed|No secrets' "$log" | tail -1 | sed -E 's/^ +//')"
    results+=("PASS  $name${detail:+  ($detail)}")
    rm -f "$log"
  else
    results+=("FAIL  $name")
    printf '%s\n' "${results[@]}"
    echo; echo "---- $name output ----"; tail -60 "$log"
    rm -f "$log"
    exit 1
  fi
}

step "secret check"   npm run --silent check:secrets
step "lint"           npm run --silent lint
step "typecheck"      npm run --silent typecheck
step "unit tests"     npm test --silent
step "build"          npm run --silent build
step "bundle check"   npm run --silent check:bundle
step "SQL tests"      bash scripts/check-sql.sh
step "whitespace"     git diff --check HEAD

printf '%s\n' "${results[@]}"
echo "All checks passed."
