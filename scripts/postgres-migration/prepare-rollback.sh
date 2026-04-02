#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env ROLLBACK_DATABASE_URL
require_env DATABASE_SSL_CA_CERT_PATH
require_readable_file DATABASE_SSL_CA_CERT_PATH "$DATABASE_SSL_CA_CERT_PATH"
assert_postgres_url_has_sslmode_verify_full "$ROLLBACK_DATABASE_URL" ROLLBACK_DATABASE_URL
assert_database_url_uses_explicit_host "$ROLLBACK_DATABASE_URL" ROLLBACK_DATABASE_URL

PGSSLROOTCERT="$DATABASE_SSL_CA_CERT_PATH" psql "$ROLLBACK_DATABASE_URL" -c "select 1" >/dev/null
printf '%s\n' "$ROLLBACK_DATABASE_URL"
