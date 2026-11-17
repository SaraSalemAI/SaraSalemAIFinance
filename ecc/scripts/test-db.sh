#!/usr/bin/env bash
# Apply migrations to a throwaway Postgres database and run the RLS test suite.
# Usage: PGHOST=/var/tmp PGPORT=54322 scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=ecc_test_$$
export PGUSER=${PGUSER:-postgres}
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c 'create extension if not exists pgcrypto'
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
[ "${WITH_SEED:-0}" = 1 ] && psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/seed.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/10_rls_tests.sql
