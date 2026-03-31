#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

require_env LOCAL_DATABASE_URL
require_env DUMP_FILE

eval "$(build_pg_dump_command "$DUMP_FILE" "$LOCAL_DATABASE_URL")"
