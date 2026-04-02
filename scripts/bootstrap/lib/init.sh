BOOTSTRAP_DB_NAME="${BOOTSTRAP_DB_NAME:-gstack_web2skill}"

sql_literal() {
  local value="${1//\'/\'\'}"
  printf "%s" "$value"
}

sql_ident() {
  local value="${1//\"/\"\"}"
  printf '%s' "$value"
}

assert_postgres16_available() {
  [[ -n "$1" && "$1" != "(none)" ]] || die "This Ubuntu/Debian release is unsupported because postgresql-16 is unavailable in the default apt repositories."
}

select_macos_postgres_formula() {
  local candidates=("$@")
  local candidate
  local line
  local selected=""

  for candidate in "${candidates[@]}"; do
    [[ -z "$candidate" ]] && continue

    while IFS= read -r line; do
      [[ -z "$line" ]] && continue

      if [[ "$line" == postgresql@16:* ]]; then
        [[ -z "$selected" ]] || die "Multiple PostgreSQL 16 Homebrew candidates found"
        selected="$line"
        continue
      fi

      if [[ "$line" == *:started ]]; then
        die "Found unsupported PostgreSQL major in running state: $line"
        return 1
      fi
    done <<< "$candidate"
  done

  [[ -n "$selected" ]] || die "No supported PostgreSQL 16 candidate found"
  printf '%s\n' "$selected"
}

select_linux_cluster() {
  local cluster_listing="$1"
  local line
  local selected=""

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    if [[ "$line" == 16\ * ]]; then
      [[ -z "$selected" ]] || die "Multiple PostgreSQL 16 clusters found"
      selected="$line"
      continue
    fi

    if [[ "$line" == *" online"* ]]; then
      die "Found unsupported PostgreSQL major in running state: $line"
      return 1
    fi
  done <<< "$cluster_listing"

  [[ -n "$selected" ]] || die "No PostgreSQL 16 cluster found"
  printf '%s\n' "$selected"
}

build_runtime_query_commands() {
  printf 'psql -h %s -p %s\n' "$SELECTED_PGHOST" "$SELECTED_PGPORT"
}

ensure_selected_instance_initialized() {
  if [[ "$PLATFORM" == "linux" ]]; then
    if [[ -z "${SELECTED_CLUSTER_VERSION:-}" || -z "${SELECTED_CLUSTER_NAME:-}" ]]; then
      require_linux_sudo_if_needed 1
      sudo -n pg_createcluster 16 main --start >/dev/null 2>&1 || true
      SELECTED_CLUSTER_VERSION=16
      SELECTED_CLUSTER_NAME=main
      SELECTED_PGHOST="/var/run/postgresql"
      SELECTED_PGPORT=5432
      export SELECTED_CLUSTER_VERSION SELECTED_CLUSTER_NAME SELECTED_PGHOST SELECTED_PGPORT
    fi
    return 0
  fi

  if [[ -n "${SELECTED_DATA_DIR:-}" && ! -d "$SELECTED_DATA_DIR/base" ]]; then
    initdb -D "$SELECTED_DATA_DIR" >/dev/null
  fi
}

discover_postgres_runtime() {
  if [[ -n "${SELECTED_PGHOST:-}" && -n "${SELECTED_PGPORT:-}" ]] && have psql; then
    local socket_dir
    local port
    socket_dir="$(psql -h "$SELECTED_PGHOST" -p "$SELECTED_PGPORT" -Atqc 'show unix_socket_directories' | cut -d, -f1 2>/dev/null || true)"
    port="$(psql -h "$SELECTED_PGHOST" -p "$SELECTED_PGPORT" -Atqc 'show port' 2>/dev/null || true)"
    [[ -n "$socket_dir" ]] && SELECTED_PGHOST="$socket_dir"
    [[ -n "$port" ]] && SELECTED_PGPORT="$port"
  fi

  PGHOST="$SELECTED_PGHOST"
  PGPORT="$SELECTED_PGPORT"
  export PGHOST PGPORT SELECTED_PGHOST SELECTED_PGPORT
}

postgres_superuser_cmd() {
  if [[ "$PLATFORM" == "linux" ]]; then
    printf 'sudo -n -u postgres psql -h %s -p %s\n' "$SELECTED_PGHOST" "$SELECTED_PGPORT"
  else
    printf 'psql -U postgres -h %s -p %s\n' "$SELECTED_PGHOST" "$SELECTED_PGPORT"
  fi
}

resolve_bootstrap_username() {
  printf '%s\n' "${USER:-${LOGNAME:-$(id -un)}}"
}

build_role_exists_check() {
  local role_name
  role_name="$(sql_literal "$1")"
  printf "SELECT 1 FROM pg_roles WHERE rolname='%s'" "$role_name"
}

build_role_login_check() {
  local role_name
  role_name="$(sql_literal "$1")"
  printf "SELECT 1 FROM pg_roles WHERE rolname='%s' AND rolcanlogin" "$role_name"
}

build_role_create_sql() {
  printf 'CREATE ROLE "%s" LOGIN' "$(sql_ident "$1")"
}

build_database_exists_check() {
  local db_name
  db_name="$(sql_literal "$1")"
  printf "SELECT 1 FROM pg_database WHERE datname='%s'" "$db_name"
}

build_database_owner_check() {
  local db_name owner
  db_name="$(sql_literal "$1")"
  owner="$(sql_literal "$2")"
  printf "SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname='%s' AND r.rolname='%s'" "$db_name" "$owner"
}

build_database_create_sql() {
  printf 'CREATE DATABASE "%s" OWNER "%s"' "$(sql_ident "$1")" "$(sql_ident "$2")"
}

build_database_url() {
  local user_name="$1"
  local host_path="$2"
  local port="$3"
  local db_name="$4"
  printf 'postgresql://%s@/%s?host=%s&port=%s\n' "$user_name" "$db_name" "$host_path" "$port"
}

run_superuser_query() {
  local sql="$1"
  if [[ "$PLATFORM" == "linux" ]]; then
    sudo -n -u postgres psql -h "$SELECTED_PGHOST" -p "$SELECTED_PGPORT" -Atqc "$sql"
  else
    psql -U postgres -h "$SELECTED_PGHOST" -p "$SELECTED_PGPORT" -Atqc "$sql"
  fi
}

run_superuser_command() {
  local sql="$1"
  if [[ "$PLATFORM" == "linux" ]]; then
    sudo -n -u postgres psql -h "$SELECTED_PGHOST" -p "$SELECTED_PGPORT" -v ON_ERROR_STOP=1 -c "$sql"
  else
    psql -U postgres -h "$SELECTED_PGHOST" -p "$SELECTED_PGPORT" -v ON_ERROR_STOP=1 -c "$sql"
  fi
}

ensure_database_role() {
  local role_name="${BOOTSTRAP_DB_USER:?BOOTSTRAP_DB_USER is required}"

  if [[ "$(run_superuser_query "$(build_role_login_check "$role_name")" | tr -d '[:space:]')" == "1" ]]; then
    return 0
  fi

  if [[ "$(run_superuser_query "$(build_role_exists_check "$role_name")" | tr -d '[:space:]')" == "1" ]]; then
    die "PostgreSQL role $role_name exists without LOGIN."
    return 1
  fi

  run_superuser_command "$(build_role_create_sql "$role_name")" >/dev/null
}

ensure_database() {
  local db_name="${BOOTSTRAP_DB_NAME:?BOOTSTRAP_DB_NAME is required}"
  local role_name="${BOOTSTRAP_DB_USER:?BOOTSTRAP_DB_USER is required}"

  if [[ "$(run_superuser_query "$(build_database_owner_check "$db_name" "$role_name")" | tr -d '[:space:]')" == "1" ]]; then
    return 0
  fi

  if [[ "$(run_superuser_query "$(build_database_exists_check "$db_name")" | tr -d '[:space:]')" == "1" ]]; then
    die "Database $db_name exists with the wrong owner."
    return 1
  fi

  run_superuser_command "$(build_database_create_sql "$db_name" "$role_name")" >/dev/null
}

ensure_project_dependencies() {
  bun install
}

build_summary_lines() {
  cat <<EOF
Setup complete.

Default database URL:
  $DATABASE_URL

Useful commands:
  bun test
  bun run skill:catalog <yupoo-album-or-category-url> [limit-for-category]
  bun run inspect:category <category-url> <limit>
  bun run ingest:category <category-url> <limit>
EOF
}

print_summary() {
  build_summary_lines
}
