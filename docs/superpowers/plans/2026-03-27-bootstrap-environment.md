# Bootstrap Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform `./setup.sh` bootstrap flow that prepares macOS and Ubuntu/Debian machines for this repo, including Bun, PostgreSQL 16, DB/user initialization, shell profile persistence, and clean-shell verification.

**Architecture:** Keep `setup.sh` as the single public entrypoint, but move nearly all behavior into focused shell modules under `scripts/bootstrap/lib/`. Test shell behavior with `bun test` by spawning isolated shell subprocesses against the library functions, so the repo keeps one test runner while the bootstrap remains shell-first. Split verification into pre-persist checks and post-persist clean-shell validation so failures do not leave bad profile state behind.

**Tech Stack:** Bash, Bun test runner, PostgreSQL 16 CLI tools, Homebrew, apt/systemctl/service, pg_lsclusters/pg_createcluster/pg_ctlcluster

---

## File Structure

### Files to modify
- `setup.sh` — replace the current inline macOS-oriented flow with a thin orchestrator that sources the bootstrap modules and runs the approved staged flow.
- `package.json` — add a focused bootstrap test script for faster iteration.
- `scripts/bootstrap/lib/init.sh` — later tasks extend it from selection logic to runtime discovery and DB mutation.
- `scripts/bootstrap/lib/profile.sh` — later tasks extend it with bounded rollback support.

### Files to create
- `scripts/bootstrap/lib/common.sh` — shared logging, errors, helper predicates, and constants used by all modules.
- `scripts/bootstrap/lib/os.sh` — supported-platform detection, login-shell resolution, service-manager selection.
- `scripts/bootstrap/lib/install.sh` — Homebrew/Bun/PostgreSQL package installation and Linux sudo gating.
- `scripts/bootstrap/lib/init.sh` — PostgreSQL 16 support checks, candidate selection, initialization, runtime discovery, role/database creation.
- `scripts/bootstrap/lib/profile.sh` — managed block rendering, profile targeting, bash login-shell sourcing support, rollback helpers.
- `scripts/bootstrap/lib/verify.sh` — pre-persist validation, exact `DATABASE_URL` verification, profile marker checks, clean-shell validation, final summary.
- `src/bootstrap/testUtils.ts` — shared Bun helpers for running shell snippets with isolated env.
- `src/bootstrap/testUtils.test.ts` — harness smoke test proving shell helpers can be sourced.
- `src/bootstrap/os.test.ts` — tests for platform/login-shell/service-manager detection.
- `src/bootstrap/profile.test.ts` — tests for managed block rendering, bash sourcing support, and rollback behavior.
- `src/bootstrap/postgresSelection.test.ts` — tests for PostgreSQL 16 candidate selection, unsupported-major conflicts, Linux release support checks, and runtime command construction.
- `src/bootstrap/verify.test.ts` — tests for exact `DATABASE_URL` checks, profile markers, owner/login verification commands, and clean-shell validation command generation.

### Files intentionally left alone
- `src/db/client.ts` — do not change in the first pass; bootstrap must set `DATABASE_URL` explicitly instead of redesigning app DB config.

## Task 1: Scaffold the shell library test harness

**Files:**
- Create: `scripts/bootstrap/lib/common.sh`
- Create: `src/bootstrap/testUtils.ts`
- Create: `src/bootstrap/testUtils.test.ts`
- Modify: `package.json`
- Test: `src/bootstrap/testUtils.test.ts`

- [ ] **Step 1: Write the failing harness smoke test**

```ts
import { expect, test } from "bun:test"
import { runShell } from "./testUtils"

test("runShell can source common bootstrap helpers", async () => {
  const result = await runShell("source scripts/bootstrap/lib/common.sh && have bash")
  expect(result.exitCode).toBe(0)
})
```

- [ ] **Step 2: Run the harness smoke test and confirm it fails**

Run: `bun test src/bootstrap/testUtils.test.ts -t "runShell can source common bootstrap helpers"`
Expected: FAIL with missing file/import errors.

- [ ] **Step 3: Create the shared shell harness helpers**

```sh
# scripts/bootstrap/lib/common.sh
have() {
  command -v "$1" >/dev/null 2>&1
}

die() {
  printf '%s\n' "$*" >&2
  return 1
}
```

```ts
// src/bootstrap/testUtils.ts
import { spawn } from "bun"

export async function runShell(script: string, env: Record<string, string> = {}) {
  const proc = spawn(["bash", "-lc", script], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })

  return {
    exitCode: await proc.exited,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  }
}
```

```ts
// src/bootstrap/testUtils.test.ts
import { expect, test } from "bun:test"
import { runShell } from "./testUtils"

test("runShell can source common bootstrap helpers", async () => {
  const result = await runShell("source scripts/bootstrap/lib/common.sh && have bash")
  expect(result.exitCode).toBe(0)
})
```

- [ ] **Step 4: Add a focused bootstrap test command**

```json
{
  "scripts": {
    "test": "bun test",
    "test:bootstrap": "bun test src/bootstrap"
  }
}
```

- [ ] **Step 5: Run the focused bootstrap suite**

Run: `bun run test:bootstrap`
Expected: PASS for the harness smoke test.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/bootstrap/lib/common.sh src/bootstrap/testUtils.ts src/bootstrap/testUtils.test.ts
git commit -m "test: scaffold bootstrap shell harness"
```

## Task 2: Implement platform, login-shell, and service-manager detection

**Files:**
- Create: `scripts/bootstrap/lib/os.sh`
- Create: `src/bootstrap/os.test.ts`
- Test: `src/bootstrap/os.test.ts`

- [ ] **Step 1: Write failing tests for supported-platform and shell-detection rules**

```ts
import { expect, test } from "bun:test"
import { runShell } from "./testUtils"

test("resolve_login_shell prefers account shell over wrapper shell input", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/os.sh",
    'resolve_login_shell "/bin/zsh" "/bin/bash"',
  ].join(" && "))

  expect(result.stdout.trim()).toBe("zsh")
})

test("resolve_service_manager falls back to service when systemctl is unavailable", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/os.sh",
    'resolve_service_manager 0 1',
  ].join(" && "))

  expect(result.stdout.trim()).toBe("service")
})

test("detect_platform_name rejects unsupported platforms", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/os.sh",
    'detect_platform_name freebsd',
  ].join(" && "))

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Unsupported platform")
})
```

- [ ] **Step 2: Run the OS tests and confirm they fail**

Run: `bun test src/bootstrap/os.test.ts`
Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement login-shell and supported-platform helpers**

```sh
# scripts/bootstrap/lib/os.sh
validate_invocation() {
  [[ "${EUID:-$(id -u)}" -ne 0 ]] || die "Run setup.sh as a normal user."
}

resolve_login_shell() {
  local account_shell="$1"
  local env_shell="$2"
  local shell_path="${account_shell:-$env_shell}"
  basename "$shell_path"
}

detect_platform_name() {
  case "$1" in
    darwin*|macos) printf 'macos\n' ;;
    linux*) printf 'linux\n' ;;
    *) die "Unsupported platform: $1. Supported platforms: macOS and Ubuntu/Debian Linux." ;;
  esac
}
```

- [ ] **Step 4: Implement distro and service-manager resolution**

```sh
detect_os() {
  PLATFORM="$(detect_platform_name "${OSTYPE:-$(uname | tr '[:upper:]' '[:lower:]')}")"

  if [[ "$PLATFORM" == "linux" ]]; then
    [[ -f /etc/debian_version ]] || die "Only Ubuntu/Debian Linux is supported."
  fi
}

resolve_service_manager() {
  local has_systemctl="$1"
  local has_service="$2"
  [[ "$has_systemctl" == "1" ]] && { printf 'systemctl\n'; return 0; }
  [[ "$has_service" == "1" ]] && { printf 'service\n'; return 0; }
  die "No supported service manager found"
}
```

- [ ] **Step 5: Re-run the OS tests**

Run: `bun test src/bootstrap/os.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/bootstrap/lib/os.sh src/bootstrap/os.test.ts
git commit -m "feat: add bootstrap platform detection"
```

## Task 3: Implement profile targeting, bash sourcing, and bounded rollback

**Files:**
- Create: `scripts/bootstrap/lib/profile.sh`
- Create: `src/bootstrap/profile.test.ts`
- Test: `src/bootstrap/profile.test.ts`

- [ ] **Step 1: Write failing tests for managed block rendering and rollback rules**

```ts
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runShell } from "./testUtils"

test("render_profile_block embeds the exact DATABASE_URL", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/profile.sh",
    'render_profile_block "postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433" ""',
  ].join(" && "))

  expect(result.stdout).toContain('export DATABASE_URL="postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433"')
})

test("ensure_bash_login_sourcing adds a .bashrc source line when needed", async () => {
  const home = mkdtempSync(join(tmpdir(), "bootstrap-profile-"))
  writeFileSync(join(home, ".bashrc"), "export FOO=bar\n")
  writeFileSync(join(home, ".bash_profile"), "")

  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/profile.sh",
    `HOME="${home}" ensure_bash_login_sourcing`,
  ].join(" && "))

  expect(result.exitCode).toBe(0)
  expect(readFileSync(join(home, ".bash_profile"), "utf8")).toContain('source "$HOME/.bashrc"')
})

test("rollback removes a bootstrap-added sourcing line", async () => {
  const home = mkdtempSync(join(tmpdir(), "bootstrap-rollback-"))
  const profile = join(home, ".bash_profile")
  writeFileSync(profile, '# bootstrap-added\nsource "$HOME/.bashrc"\n')

  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/profile.sh",
    `BOOTSTRAP_ADDED_BASH_SOURCE_TARGET="${profile}" rollback_profile_changes`,
  ].join(" && "))

  expect(result.exitCode).toBe(0)
  expect(readFileSync(profile, "utf8")).not.toContain('source "$HOME/.bashrc"')
})
```

- [ ] **Step 2: Run the profile tests and confirm they fail**

Run: `bun test src/bootstrap/profile.test.ts`
Expected: FAIL because profile helpers do not exist.

- [ ] **Step 3: Implement managed block rendering and target resolution**

```sh
# scripts/bootstrap/lib/profile.sh
render_profile_block() {
  local database_url="$1"
  local bun_exports="$2"
  cat <<EOF
# >>> gstack-web2skill bootstrap >>>
export DATABASE_URL="$database_url"
$bun_exports# <<< gstack-web2skill bootstrap <<<
EOF
}

resolve_profile_target() {
  case "$1" in
    zsh) printf '%s\n' "$HOME/.zshrc" ;;
    bash) printf '%s\n' "$HOME/.bashrc" ;;
    *) die "Unsupported login shell: $1" ;;
  esac
}
```

- [ ] **Step 4: Implement bash login-shell sourcing support**

```sh
ensure_bash_login_sourcing() {
  # Prefer ~/.bash_profile, then ~/.profile.
  # If neither file exists, create the minimal file needed.
  # If a file already sources ~/.bashrc, leave it alone.
  # If this function adds the sourcing line, record the touched file path for rollback.
}
```

- [ ] **Step 5: Implement managed-block replacement and bounded rollback helpers**

```sh
rollback_profile_changes() {
  remove_managed_block "$PROFILE_TARGET"
  [[ "${PROFILE_CREATED_BY_BOOTSTRAP:-0}" == "1" ]] && rm -f "$PROFILE_TARGET"
  [[ -n "${BOOTSTRAP_ADDED_BASH_SOURCE_TARGET:-}" ]] && remove_bootstrap_bash_source "$BOOTSTRAP_ADDED_BASH_SOURCE_TARGET"
}
```

- [ ] **Step 6: Re-run the profile tests**

Run: `bun test src/bootstrap/profile.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/bootstrap/lib/profile.sh src/bootstrap/profile.test.ts
git commit -m "feat: add bootstrap profile persistence"
```

## Task 4: Implement PostgreSQL 16 support checks, candidate selection, and runtime discovery

**Files:**
- Create: `scripts/bootstrap/lib/init.sh`
- Create: `src/bootstrap/postgresSelection.test.ts`
- Test: `src/bootstrap/postgresSelection.test.ts`

- [ ] **Step 1: Write failing tests for PG16-only support and selection rules**

```ts
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

test("ubuntu selects the only PostgreSQL 16 cluster", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'select_linux_cluster $"16 main 5432 online"',
  ].join(" && "))

  expect(result.stdout.trim()).toContain("16 main")
})

test("discover_postgres_runtime uses the selected host and port", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/init.sh",
    'SELECTED_PGHOST=/tmp/pg SELECTED_PGPORT=5433 build_runtime_query_commands',
  ].join(" && "))

  expect(result.stdout).toContain('-h /tmp/pg')
  expect(result.stdout).toContain('-p 5433')
})
```

- [ ] **Step 2: Run the PostgreSQL selection tests and confirm they fail**

Run: `bun test src/bootstrap/postgresSelection.test.ts`
Expected: FAIL because the PostgreSQL helpers do not exist.

- [ ] **Step 3: Implement support and selection helpers**

```sh
# scripts/bootstrap/lib/init.sh
assert_postgres16_available() {
  [[ -n "$1" ]] || die "This Ubuntu/Debian release is unsupported because postgresql-16 is unavailable in the default apt repositories."
}

select_macos_postgres_formula() {
  # Inspect installed Homebrew formulas/services.
  # Choose one safe postgresql@16 formula or fail on ambiguity/conflict.
}

select_linux_cluster() {
  # Parse pg_lsclusters-like input.
  # Choose one PostgreSQL 16 cluster or fail on ambiguity/conflict.
}
```

- [ ] **Step 4: Implement selected-instance initialization and runtime command builders**

```sh
ensure_selected_instance_initialized() {
  # On macOS, initialize the chosen Homebrew postgresql@16 data dir when absent.
  # On Ubuntu/Debian, create the PostgreSQL 16 cluster when absent.
}

build_runtime_query_commands() {
  printf 'psql -h %s -p %s' "$SELECTED_PGHOST" "$SELECTED_PGPORT"
}

discover_postgres_runtime() {
  local base_cmd
  base_cmd="$(build_runtime_query_commands)"
  PGHOST="$($base_cmd -Atqc 'show unix_socket_directories' | cut -d, -f1)"
  PGPORT="$($base_cmd -Atqc 'show port')"
  export PGHOST PGPORT
}
```

- [ ] **Step 5: Implement explicit privilege-path helpers for inspection and mutation**

```sh
postgres_superuser_cmd() {
  if [[ "$PLATFORM" == "linux" ]]; then
    printf 'sudo -n -u postgres psql -h %s -p %s' "$SELECTED_PGHOST" "$SELECTED_PGPORT"
  else
    printf 'psql -U postgres -h %s -p %s' "$SELECTED_PGHOST" "$SELECTED_PGPORT"
  fi
}
```

- [ ] **Step 6: Re-run the PostgreSQL selection tests**

Run: `bun test src/bootstrap/postgresSelection.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/bootstrap/lib/init.sh src/bootstrap/postgresSelection.test.ts
git commit -m "feat: add bootstrap postgres selection"
```

## Task 5: Implement installation, DB initialization, and entrypoint orchestration

**Files:**
- Create: `scripts/bootstrap/lib/install.sh`
- Modify: `scripts/bootstrap/lib/init.sh`
- Modify: `setup.sh`
- Test: `src/bootstrap/os.test.ts`
- Test: `src/bootstrap/postgresSelection.test.ts`

- [ ] **Step 1: Write failing tests for Bun provenance and deferred Linux sudo gating**

```ts
import { expect, test } from "bun:test"
import { runShell } from "./testUtils"

test("compute_bun_profile_exports omits exports when bun comes from homebrew", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/install.sh",
    'compute_bun_profile_exports "/opt/homebrew/bin/bun"',
  ].join(" && "))

  expect(result.stdout.trim()).toBe("")
})

test("require_linux_sudo_if_needed skips sudo checks when no privileged step is pending", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/install.sh",
    'require_linux_sudo_if_needed 0',
  ].join(" && "))

  expect(result.exitCode).toBe(0)
})
```

- [ ] **Step 2: Run the targeted install-flow tests and confirm they fail**

Run: `bun test src/bootstrap/os.test.ts src/bootstrap/postgresSelection.test.ts -t "compute_bun_profile_exports omits exports when bun comes from homebrew"`
Expected: FAIL because `compute_bun_profile_exports` is missing.

- [ ] **Step 3: Implement install helpers**

```sh
# scripts/bootstrap/lib/install.sh
ensure_homebrew() {
  have brew && return 0
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(brew shellenv)"
  have brew || die "brew shellenv did not make Homebrew available"
}

compute_bun_profile_exports() {
  case "$1" in
    "$HOME"/.bun/*)
      printf 'export BUN_INSTALL="%s/.bun"\nexport PATH="$BUN_INSTALL/bin:$PATH"\n' "$HOME"
      ;;
  esac
}

require_linux_sudo_if_needed() {
  local needs_privileged_step="$1"
  [[ "$needs_privileged_step" == "1" ]] || return 0
  sudo -n true >/dev/null 2>&1 || die "A privileged Linux step is required and non-interactive sudo is unavailable."
}
```

- [ ] **Step 4: Extend `init.sh` with role/database creation and dependency install flow**

```sh
ensure_database_role() {
  # Verify role state on the selected instance.
  # Fail if a matching role exists without LOGIN.
  # Create the role through the platform-specific superuser path when missing.
}

ensure_database() {
  # Fail if the DB exists with the wrong owner.
  # Create gstack_web2skill owned by the invoking user when missing.
}

ensure_project_dependencies() {
  bun install
}
```

- [ ] **Step 5: Rewire `setup.sh` only after the modules exist**

```sh
#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/scripts/bootstrap/lib/common.sh"
source "$(dirname "$0")/scripts/bootstrap/lib/os.sh"
source "$(dirname "$0")/scripts/bootstrap/lib/install.sh"
source "$(dirname "$0")/scripts/bootstrap/lib/init.sh"
source "$(dirname "$0")/scripts/bootstrap/lib/profile.sh"
source "$(dirname "$0")/scripts/bootstrap/lib/verify.sh"

main() {
  validate_invocation
  detect_os
  ensure_prerequisites
  install_bun
  install_postgres
  start_postgres
  ensure_selected_instance_initialized
  discover_postgres_runtime
  ensure_database_role
  ensure_database
  ensure_project_dependencies
  ensure_shell_profile
  verify_environment
}

main "$@"
```

- [ ] **Step 6: Run the focused bootstrap suite**

Run: `bun run test:bootstrap`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add setup.sh scripts/bootstrap/lib/install.sh scripts/bootstrap/lib/init.sh src/bootstrap/os.test.ts src/bootstrap/postgresSelection.test.ts
git commit -m "feat: orchestrate bootstrap install flow"
```

## Task 6: Implement exact verification, pre-persist guards, and rollback-aware clean-shell validation

**Files:**
- Create: `scripts/bootstrap/lib/verify.sh`
- Create: `src/bootstrap/verify.test.ts`
- Modify: `scripts/bootstrap/lib/profile.sh`
- Modify: `setup.sh`
- Test: `src/bootstrap/verify.test.ts`

- [ ] **Step 1: Write failing tests for the verification contract**

```ts
import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runShell } from "./testUtils"

test("build_clean_shell_check asserts exact DATABASE_URL and runs psql", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/verify.sh",
    'build_clean_shell_check zsh "postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433"',
  ].join(" && "))

  expect(result.stdout).toContain('test "$DATABASE_URL" = "$EXPECTED_DATABASE_URL"')
  expect(result.stdout).toContain('psql "$DATABASE_URL" -c "select 1"')
})

test("verify_profile_block_presence requires bootstrap markers", async () => {
  const home = mkdtempSync(join(tmpdir(), "bootstrap-verify-"))
  const profile = join(home, ".zshrc")
  writeFileSync(profile, "export DATABASE_URL=bad\n")

  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/verify.sh",
    `verify_profile_block_presence "${profile}"`,
  ].join(" && "))

  expect(result.exitCode).toBe(1)
})

test("build_database_owner_check verifies the expected owner", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/verify.sh",
    'build_database_owner_check gstack_web2skill alice',
  ].join(" && "))

  expect(result.stdout).toContain("d.datname='gstack_web2skill'")
  expect(result.stdout).toContain("r.rolname='alice'")
})

test("build_role_login_check verifies rolcanlogin", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/verify.sh",
    'build_role_login_check alice',
  ].join(" && "))

  expect(result.stdout).toContain("rolname='alice'")
  expect(result.stdout).toContain("rolcanlogin")
})
```

- [ ] **Step 2: Run the verification tests and confirm they fail**

Run: `bun test src/bootstrap/verify.test.ts`
Expected: FAIL because verification helpers do not exist.

- [ ] **Step 3: Implement pre-persist validation helpers**

```sh
# scripts/bootstrap/lib/verify.sh
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
```

- [ ] **Step 4: Implement pre-persist environment validation**

```sh
validate_pre_persist_environment() {
  command -v bun >/dev/null
  command -v psql >/dev/null
  verify_dependencies_installed
  pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null
  psql -h "$PGHOST" -p "$PGPORT" -tAc "$(build_role_login_check "$BOOTSTRAP_DB_USER")" | grep -q 1
  psql -h "$PGHOST" -p "$PGPORT" -tAc "$(build_database_owner_check "$BOOTSTRAP_DB_NAME" "$BOOTSTRAP_DB_USER")" | grep -q 1
  psql "$DATABASE_URL" -c "select 1" >/dev/null
}
```

- [ ] **Step 5: Implement post-persist clean-shell verification and rollback wiring**

```sh
validate_post_persist_environment() {
  verify_profile_block_presence "$PROFILE_TARGET"
  EXPECTED_DATABASE_URL="$DATABASE_URL" eval "$(build_clean_shell_check "$LOGIN_SHELL_NAME" "$DATABASE_URL")"
}

verify_environment() {
  validate_pre_persist_environment
  validate_post_persist_environment
}
```

```sh
# setup.sh
if ! verify_environment; then
  rollback_profile_changes
  exit 1
fi
```

- [ ] **Step 6: Run the bootstrap suite and full repo tests**

Run: `bun run test:bootstrap && bun test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add setup.sh scripts/bootstrap/lib/profile.sh scripts/bootstrap/lib/verify.sh src/bootstrap/verify.test.ts
git commit -m "feat: verify bootstrap environment end-to-end"
```

## Task 7: Execute the required manual validation matrix

**Files:**
- Test: local macOS shell
- Test: local Ubuntu/Debian shell
- Reference: `docs/superpowers/specs/2026-03-27-bootstrap-environment-design.md`

- [ ] **Step 1: Run the macOS success-path matrix from the spec**

Run in separate environments:
- `./setup.sh` from a zsh login shell
- `./setup.sh` from a bash login shell
- `./setup.sh` on a machine without Homebrew
- `./setup.sh` on a machine with non-default PostgreSQL socket/port

Expected: each success case matches the corresponding spec row, including exact `DATABASE_URL` persistence and clean-shell verification.

- [ ] **Step 2: Run the Ubuntu/Debian success-path matrix from the spec**

Run in separate environments:
- `./setup.sh` from a bash login shell
- `./setup.sh` from a zsh login shell
- rerun `./setup.sh` with no privileged work remaining
- `./setup.sh` where packages exist but no PostgreSQL 16 cluster is initialized

Expected: each success case matches the corresponding spec row, including `sudo -n true` not being required on already-configured reruns.

- [ ] **Step 3: Run the conflict/failure matrix from the spec**

Run the scenarios called out in the approved matrix:
- unsupported platform
- unsupported Ubuntu/Debian release without `postgresql-16` in default apt
- multiple PostgreSQL 16 formulas/clusters
- unsupported running PostgreSQL major
- missing non-interactive sudo when a privileged step is required
- inability to inspect PostgreSQL metadata
- insufficient PostgreSQL privilege
- matching role without `LOGIN`
- wrong database owner
- wrapper-shell invocation
- Bun available only in a transient shell

Expected: each case fails or succeeds exactly as the corresponding spec row requires, and any hard conflict fails before profile writes.

- [ ] **Step 4: Run the rollback and recovery matrix from the spec**

Run the scenarios called out in the approved matrix:
- existing managed block with stale values
- post-write clean-shell verification failure after managed block replacement
- post-write clean-shell verification failure after bash sourcing change added by this run
- rerun after interrupted failure mid-bootstrap
- repeated idempotency reruns for macOS and Ubuntu/Debian login-shell variants

Expected: rollback and recovery behavior matches the Profile Rollback Contract and idempotency rules exactly.

- [ ] **Step 5: Run repo-level verification**

Run: `bun run test:bootstrap && bun test`
Expected: PASS.

- [ ] **Step 6: Commit the final implementation state**

```bash
git add setup.sh package.json scripts/bootstrap/lib src/bootstrap
git commit -m "feat: add cross-platform bootstrap setup"
```

## Notes for the implementer

- Keep helper functions small and side-effect-light where possible; that is what makes the Bun subprocess tests cheap to write and reliable.
- Do not add PGDG handling, non-PG16 fallback logic, or Windows support.
- Do not refactor unrelated application code.
- Prefer explicit failure with actionable stderr over silent fallback.
- When a function depends on platform commands (`brew`, `pg_lsclusters`, `pg_ctlcluster`), isolate command construction from execution so tests can cover selection logic without requiring the real command.
- Treat the spec’s manual matrix as mandatory: this task is done only when every required row in `docs/superpowers/specs/2026-03-27-bootstrap-environment-design.md` has been exercised or explicitly documented as blocked.
