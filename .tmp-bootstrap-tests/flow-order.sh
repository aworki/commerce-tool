CALLS=()
record() { CALLS+=("$1"); }
validate_invocation() { record validate_invocation; }
detect_os() { record detect_os; }
ensure_prerequisites() { record ensure_prerequisites; BOOTSTRAP_DB_USER=alice; BOOTSTRAP_DB_NAME=gstack_web2skill; export BOOTSTRAP_DB_USER BOOTSTRAP_DB_NAME; }
install_bun() { record install_bun; }
install_postgres() { record install_postgres; }
start_postgres() { record start_postgres; }
ensure_selected_instance_initialized() { record ensure_selected_instance_initialized; }
discover_postgres_runtime() { record discover_postgres_runtime; PGHOST=/tmp/pg; PGPORT=5433; export PGHOST PGPORT; }
ensure_database_role() { record ensure_database_role; }
ensure_database() { record ensure_database; }
ensure_project_dependencies() { record ensure_project_dependencies; }
ensure_shell_profile() { record ensure_shell_profile; }
verify_environment() { record verify_environment; }
print_summary() { printf "%s\n" "${CALLS[@]}"; }
