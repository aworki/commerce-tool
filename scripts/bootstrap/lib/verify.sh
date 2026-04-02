build_clean_shell_check() {
  local shell_name="$1"
  local expected_database_url="$2"
  printf '%s -lic '\''test "$DATABASE_URL" = "$EXPECTED_DATABASE_URL" && command -v bun && psql "$DATABASE_URL" -c "select 1"'\''' "$shell_name"
}

verify_profile_block_presence() {
  grep -q '# >>> gstack-web2skill bootstrap >>>' "$1" || return 1
  grep -q '# <<< gstack-web2skill bootstrap <<<' "$1"
}

build_role_login_check() {
  local role_name="$1"
  printf "SELECT 1 FROM pg_roles WHERE rolname='%s' AND rolcanlogin" "$role_name"
}

build_database_owner_check() {
  local db_name="$1"
  local owner="$2"
  printf "SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname='%s' AND r.rolname='%s'" "$db_name" "$owner"
}

verify_dependencies_installed() {
  test -d node_modules/pg
}

validate_pre_persist_environment() {
  command -v bun >/dev/null
  command -v psql >/dev/null
  verify_dependencies_installed
  pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null
  psql -h "$PGHOST" -p "$PGPORT" -tAc "$(build_role_login_check "$BOOTSTRAP_DB_USER")" | grep -q 1
  psql -h "$PGHOST" -p "$PGPORT" -tAc "$(build_database_owner_check "$BOOTSTRAP_DB_NAME" "$BOOTSTRAP_DB_USER")" | grep -q 1
  psql "$DATABASE_URL" -c "select 1" >/dev/null
}

validate_post_persist_environment() {
  verify_profile_block_presence "$PROFILE_TARGET"
  EXPECTED_DATABASE_URL="$DATABASE_URL" eval "$(build_clean_shell_check "$LOGIN_SHELL_NAME" "$DATABASE_URL")"
}

verify_environment() {
  validate_pre_persist_environment
  validate_post_persist_environment
}
