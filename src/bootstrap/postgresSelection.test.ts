import { expect, test } from "bun:test"
import { runShell } from "./testUtils"

test("ubuntu fails when default apt repos do not provide postgresql-16", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'assert_postgres16_available ""',
  ].join(" && "))

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("unsupported")
})

test("macOS rejects unsupported running PostgreSQL major", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'select_macos_postgres_formula "postgresql@15:started" "postgresql@16:stopped"',
  ].join(" && "))

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("unsupported PostgreSQL major")
})

test("macOS rejects unsupported running PostgreSQL major from multiline service output", async () => {
  const result = await runShell(`
    source scripts/bootstrap/lib/common.sh
    source scripts/bootstrap/lib/init.sh
    select_macos_postgres_formula $'postgresql@15:started\npostgresql@16:error'
  `)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("unsupported PostgreSQL major")
})

test("macOS selects postgresql@16 from multiline installed/service output", async () => {
  const result = await runShell(`
    source scripts/bootstrap/lib/common.sh
    source scripts/bootstrap/lib/init.sh
    select_macos_postgres_formula $'postgresql@16:error'
  `)

  expect(result.exitCode).toBe(0)
  expect(result.stdout.trim()).toBe("postgresql@16:error")
})

test("ubuntu selects the only PostgreSQL 16 cluster", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    "select_linux_cluster $'16 main 5432 online'",
  ].join(" && "))

  expect(result.stdout.trim()).toBe("16 main 5432 online")
})

test("build_runtime_query_commands uses the selected host and port", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'SELECTED_PGHOST=/tmp/pg SELECTED_PGPORT=5433 build_runtime_query_commands',
  ].join(" && "))

  expect(result.stdout).toContain("-h /tmp/pg")
  expect(result.stdout).toContain("-p 5433")
})

test("postgres_superuser_cmd uses sudo on linux", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'PLATFORM=linux SELECTED_PGHOST=/tmp/pg SELECTED_PGPORT=5433 postgres_superuser_cmd',
  ].join(" && "))

  expect(result.stdout).toContain("sudo -n -u postgres psql")
})

test("postgres_superuser_cmd uses postgres user directly on macOS", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'PLATFORM=macos SELECTED_PGHOST=/tmp/pg SELECTED_PGPORT=5433 postgres_superuser_cmd',
  ].join(" && "))

  expect(result.stdout).toContain("psql -U postgres")
  expect(result.stdout).not.toContain("sudo -n")
})

test("build_role_exists_check targets the expected role name", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'build_role_exists_check alice',
  ].join(" && "))

  expect(result.stdout).toContain("rolname='alice'")
})

test("build_database_exists_check targets the expected database name", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'build_database_exists_check gstack_web2skill',
  ].join(" && "))

  expect(result.stdout).toContain("datname='gstack_web2skill'")
})

test("build_database_create_sql creates the database with the expected owner", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'build_database_create_sql gstack_web2skill alice',
  ].join(" && "))

  expect(result.stdout).toContain('CREATE DATABASE "gstack_web2skill" OWNER "alice"')
})

test("build_database_url uses socket host, port, user, and db", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'build_database_url alice /tmp/pg 5433 gstack_web2skill',
  ].join(" && "))

  expect(result.stdout.trim()).toBe("postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433")
})

test("resolve_bootstrap_username prefers USER over fallback", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'USER=alice LOGNAME=bob resolve_bootstrap_username',
  ].join(" && "))

  expect(result.stdout.trim()).toBe("alice")
})

test("resolve_bootstrap_username falls back to LOGNAME", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'unset USER; LOGNAME=bob resolve_bootstrap_username',
  ].join(" && "))

  expect(result.stdout.trim()).toBe("bob")
})

test("build_summary_lines includes the resolved database URL", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'BOOTSTRAP_DB_USER=alice BOOTSTRAP_DB_NAME=gstack_web2skill DATABASE_URL="postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433" build_summary_lines',
  ].join(" && "))

  expect(result.stdout).toContain("Setup complete.")
  expect(result.stdout).toContain("postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433")
})

test("run_bootstrap_flow calls the staged functions in order", async () => {
  const result = await runShell(`
    mkdir -p .tmp-bootstrap-tests
    cat > .tmp-bootstrap-tests/flow-order.sh <<'EOF'
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
print_summary() { printf "%s\\n" "\${CALLS[@]}"; }
EOF
    source setup.sh
    source .tmp-bootstrap-tests/flow-order.sh
    run_bootstrap_flow
  `)

  expect(result.exitCode).toBe(0)
  expect(result.stdout.trim()).toBe([
    "validate_invocation",
    "detect_os",
    "ensure_prerequisites",
    "install_bun",
    "install_postgres",
    "start_postgres",
    "ensure_selected_instance_initialized",
    "discover_postgres_runtime",
    "ensure_database_role",
    "ensure_database",
    "ensure_project_dependencies",
    "ensure_shell_profile",
    "verify_environment",
  ].join("\n"))
})
