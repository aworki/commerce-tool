#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env REMOTE_DATABASE_URL
require_env DUMP_FILE
require_env DATABASE_SSL_CA_CERT_PATH
require_readable_file DATABASE_SSL_CA_CERT_PATH "$DATABASE_SSL_CA_CERT_PATH"
assert_postgres_url_has_sslmode_verify_full "$REMOTE_DATABASE_URL" REMOTE_DATABASE_URL
assert_database_url_uses_explicit_host "$REMOTE_DATABASE_URL" REMOTE_DATABASE_URL

PGSSLROOTCERT="$DATABASE_SSL_CA_CERT_PATH" eval "$(build_pg_restore_command "$DUMP_FILE" "$REMOTE_DATABASE_URL")"
