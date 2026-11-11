#!/usr/bin/env bash
# Runs every migration and SQL test on a fresh, throwaway local Postgres 16
# database, the same way CI's "database" job does. Never point this at the
# hosted Supabase project: local-stubs.sql creates stand-in roles.
#
#   npm run check:sql
#
# Uses PGHOST/PGUSER/PGPASSWORD when set (like CI). Otherwise it uses the
# local server through the postgres OS user, starting the service if needed.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="pickle_check_$$"

if [[ -n "${PGHOST:-}${PGUSER:-}" ]]; then
  psql_run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
  admin() { "$@"; }
else
  if ! pg_isready -q 2>/dev/null; then
    echo "Starting local Postgres..."
    (service postgresql start || sudo service postgresql start) >/dev/null 2>&1 || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q && break; sleep 1; done
  fi
  pg_isready -q || { echo "Postgres is not running and could not be started." >&2; exit 1; }
  if [[ "$(id -u)" == "0" ]]; then
    psql_run() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 $(printf '%q ' "$@")"; }
    admin() { su postgres -c "$(printf '%q ' "$@")"; }
  else
    psql_run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
    admin() { "$@"; }
  fi
fi

cleanup() { admin dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
admin createdb "$DB"

out="$(mktemp)"
{
  psql_run -d "$DB" -f supabase/tests/local-stubs.sql
  for f in supabase/migrations/*.sql; do psql_run -d "$DB" -f "$f"; done
  for f in supabase/tests/*_test.sql; do psql_run -d "$DB" -f "$f"; done
} >"$out" 2>&1 || { cat "$out" >&2; echo "SQL checks FAILED" >&2; exit 1; }

passed="$(grep -c 'ok -' "$out" || true)"
if grep -qE 'ERROR|FAILED:' "$out"; then
  grep -E 'ERROR|FAILED:' "$out" >&2
  echo "SQL checks FAILED" >&2
  exit 1
fi
echo "SQL checks passed: $passed"
rm -f "$out"
