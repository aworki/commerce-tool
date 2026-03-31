#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

require_env ROLLBACK_DATABASE_URL
assert_postgres_url_has_sslmode_require "$ROLLBACK_DATABASE_URL" ROLLBACK_DATABASE_URL
assert_database_url_uses_explicit_host "$ROLLBACK_DATABASE_URL" ROLLBACK_DATABASE_URL

psql "$ROLLBACK_DATABASE_URL" -c "select 1" >/dev/null
printf '%s\n' "$ROLLBACK_DATABASE_URL"
