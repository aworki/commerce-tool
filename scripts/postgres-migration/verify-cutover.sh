#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env SOURCE_DATABASE_URL
require_env TARGET_DATABASE_URL
require_env DATABASE_SSL_CA_CERT_PATH
require_readable_file DATABASE_SSL_CA_CERT_PATH "$DATABASE_SSL_CA_CERT_PATH"
assert_postgres_url_has_sslmode_verify_full "$TARGET_DATABASE_URL" TARGET_DATABASE_URL
assert_database_url_uses_explicit_host "$TARGET_DATABASE_URL" TARGET_DATABASE_URL

for table in catalog_items team_shoes_content_templates; do
  source_count="$(psql "$SOURCE_DATABASE_URL" -Atqc "$(build_table_count_sql "$table")")"
  target_count="$(PGSSLROOTCERT="$DATABASE_SSL_CA_CERT_PATH" psql "$TARGET_DATABASE_URL" -Atqc "$(build_table_count_sql "$table")")"
  [[ "$source_count" = "$target_count" ]] || die "row count mismatch for $table: source=$source_count target=$target_count"
done

ssl_in_use="$(PGSSLROOTCERT="$DATABASE_SSL_CA_CERT_PATH" psql "$TARGET_DATABASE_URL" -Atqc "$(build_ssl_in_use_sql)")"
[[ "$ssl_in_use" = "t" ]] || die "TARGET_DATABASE_URL connection is not using TLS"
