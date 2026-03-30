#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/scripts/bootstrap/lib/common.sh"
source "$SCRIPT_DIR/scripts/bootstrap/lib/os.sh"
source "$SCRIPT_DIR/scripts/bootstrap/lib/install.sh"
source "$SCRIPT_DIR/scripts/bootstrap/lib/init.sh"
source "$SCRIPT_DIR/scripts/bootstrap/lib/profile.sh"
source "$SCRIPT_DIR/scripts/bootstrap/lib/verify.sh"

run_bootstrap_flow() {
  validate_invocation
  detect_os
  ensure_prerequisites
  install_bun
  install_postgres
  start_postgres
  ensure_selected_instance_initialized
  discover_postgres_runtime
  DATABASE_URL="$(build_database_url "$BOOTSTRAP_DB_USER" "$PGHOST" "$PGPORT" "$BOOTSTRAP_DB_NAME")"
  export DATABASE_URL
  ensure_database_role
  ensure_database
  ensure_project_dependencies
  ensure_shell_profile

  if ! verify_environment; then
    rollback_profile_changes
    return 1
  fi

  print_summary
}

main() {
  run_bootstrap_flow "$@"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
