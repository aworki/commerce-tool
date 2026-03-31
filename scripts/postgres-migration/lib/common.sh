source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/bootstrap/lib/common.sh"

require_env() {
  [[ -n "${!1:-}" ]] || die "Missing required environment variable: $1"
}

assert_postgres_url_has_sslmode_require() {
  case "$1" in
    *"sslmode=require"*) ;;
    *) die "$2 must include sslmode=require" ;;
  esac
}

assert_database_url_uses_explicit_host() {
  case "$1" in
    *"@localhost:"*|*"@127.0.0.1:"*) die "$2 must use a non-localhost network host" ;;
  esac
}

build_table_count_sql() {
  printf 'SELECT COUNT(*) FROM "%s"\n' "$1"
}

build_pg_dump_command() {
  printf 'pg_dump --format=custom --no-owner --no-privileges --file %q %q\n' "$1" "$2"
}

build_pg_restore_command() {
  printf 'pg_restore --clean --if-exists --no-owner --no-privileges --dbname %q %q\n' "$2" "$1"
}

build_ssl_in_use_sql() {
  printf 'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()\n'
}
