#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib/common.sh"

require_env SOURCE_DATABASE_URL
require_env TARGET_DATABASE_URL
assert_postgres_url_has_sslmode_require "$TARGET_DATABASE_URL" TARGET_DATABASE_URL

for table in catalog_items team_shoes_content_templates; do
  source_count="$(psql "$SOURCE_DATABASE_URL" -Atqc "$(build_table_count_sql "$table")")"
  target_count="$(psql "$TARGET_DATABASE_URL" -Atqc "$(build_table_count_sql "$table")")"
  [[ "$source_count" == "$target_count" ]] || die "$table count mismatch: $source_count != $target_count"
done

ssl_in_use="$(psql "$TARGET_DATABASE_URL" -Atqc "$(build_ssl_in_use_sql)")"
[[ "$ssl_in_use" == "t" ]] || die "TARGET_DATABASE_URL must report an active TLS session"
