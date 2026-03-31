#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

require_env REMOTE_DATABASE_URL
require_env DUMP_FILE
assert_postgres_url_has_sslmode_require "$REMOTE_DATABASE_URL" REMOTE_DATABASE_URL

eval "$(build_pg_restore_command "$DUMP_FILE" "$REMOTE_DATABASE_URL")"
