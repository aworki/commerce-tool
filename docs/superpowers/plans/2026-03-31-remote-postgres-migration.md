# Remote PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the repo changes and operator tooling needed to move from the current machine's local PostgreSQL on port 5432 to a TLS-required remote PostgreSQL 16 instance, with explicit rollback readiness and no silent runtime fallback to localhost on deployed machines.

**Architecture:** Keep the current `pg` + schema flow, but split the work into three focused layers: runtime connection guarding in TypeScript, shell-based migration/cutover helpers under `scripts/postgres-migration/`, and one operator runbook that turns the approved spec into an exact cutover checklist. Leave the existing local bootstrap flow alone; remote rollout will use explicit `DATABASE_URL` values and migration scripts instead of teaching `setup.sh` to manage remote database secrets.

**Tech Stack:** Bun test runner, TypeScript, PostgreSQL (`pg`), Bash, `pg_dump`, `pg_restore`, `psql`, existing bootstrap shell test utilities

---

## File Structure

### Files to modify
- `package.json` — add operator-facing npm scripts for export/import/verification/rollback preparation.
- `src/db/client.ts` — enforce explicit `DATABASE_URL` when deployment mode requires it, while preserving current local fallback for non-deployment use.

### Files to create
- `src/db/client.test.ts` — unit tests for explicit-URL enforcement and local fallback behavior.
- `scripts/postgres-migration/lib/common.sh` — shared shell helpers for env validation, TLS enforcement, explicit-host checks, SQL builders, and command builders.
- `scripts/postgres-migration/export-local.sh` — custom-format local export wrapper around `pg_dump`.
- `scripts/postgres-migration/import-remote.sh` — TLS-enforced remote restore wrapper around `pg_restore`.
- `scripts/postgres-migration/verify-cutover.sh` — compares key table counts and confirms TLS-backed connectivity on the target database.
- `scripts/postgres-migration/prepare-rollback.sh` — validates and prints the explicit rollback `DATABASE_URL` for the preserved current-machine PostgreSQL instance.
- `src/postgresMigration/common.test.ts` — shell-level tests for helper functions in `common.sh`.
- `src/postgresMigration/scripts.test.ts` — shell-level tests for the operator scripts and their required env contracts.
- `docs/superpowers/runbooks/remote-postgres-cutover.md` — the human runbook for rehearsal, cutover, verification, and rollback.

### Files intentionally left alone
- `setup.sh` and `scripts/bootstrap/lib/*` — keep bootstrap focused on local developer setup; do not add remote-database secret persistence to shell profiles in this implementation.
- `src/db/schema.ts` — do not change the schema or runtime table creation behavior as part of the migration.
- `src/db/catalogItems.ts` and other DB consumers — the migration should work by changing connection/runtime tooling, not by rewriting query callers.

## Task 1: Enforce the runtime database URL contract

**Files:**
- Create: `src/db/client.test.ts`
- Modify: `src/db/client.ts`
- Test: `src/db/client.test.ts`

- [ ] **Step 1: Write the failing runtime contract tests**

```ts
import { describe, expect, test } from "bun:test"
import { getDatabaseUrl } from "./client"

describe("getDatabaseUrl", () => {
  test("returns the explicit remote DATABASE_URL when provided", () => {
    expect(getDatabaseUrl({
      DATABASE_URL: "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=require",
    } as NodeJS.ProcessEnv)).toBe(
      "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=require",
    )
  })

  test("throws when deployment mode requires DATABASE_URL but it is missing", () => {
    expect(() => getDatabaseUrl({ GSTACK_REQUIRE_DATABASE_URL: "1" } as NodeJS.ProcessEnv)).toThrow(
      "DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1",
    )
  })

  test("keeps the current localhost fallback for non-deployment environments", () => {
    expect(getDatabaseUrl({} as NodeJS.ProcessEnv)).toBe(
      "postgres://bytedance@localhost:5432/gstack_web2skill",
    )
  })
})
```

- [ ] **Step 2: Run the new DB client tests and confirm they fail**

Run: `bun test src/db/client.test.ts`
Expected: FAIL with missing test file or missing strict-mode behavior.

- [ ] **Step 3: Add explicit deployment-mode enforcement to `src/db/client.ts`**

```ts
const DEFAULT_DATABASE_URL = "postgres://bytedance@localhost:5432/gstack_web2skill"

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const explicitDatabaseUrl = env.DATABASE_URL?.trim()
  if (explicitDatabaseUrl) return explicitDatabaseUrl

  if (env.GSTACK_REQUIRE_DATABASE_URL === "1") {
    throw new Error("DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1")
  }

  return DEFAULT_DATABASE_URL
}
```

- [ ] **Step 4: Re-run the DB client tests**

Run: `bun test src/db/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/client.ts src/db/client.test.ts
git commit -m "feat: require explicit database url for deployment"
```

## Task 2: Add shared migration shell helpers and lock their contracts with tests

**Files:**
- Create: `scripts/postgres-migration/lib/common.sh`
- Create: `src/postgresMigration/common.test.ts`
- Test: `src/postgresMigration/common.test.ts`

- [ ] **Step 1: Write the failing helper-contract tests**

```ts
import { describe, expect, test } from "bun:test"
import { runShell } from "../bootstrap/testUtils"

describe("postgres migration common helpers", () => {
  test("rejects a postgres url that does not include sslmode=require", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'assert_postgres_url_has_sslmode_require "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill" REMOTE_DATABASE_URL',
    ].join(" && "))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("REMOTE_DATABASE_URL must include sslmode=require")
  })

  test("rejects rollback urls that still point at localhost", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'assert_database_url_uses_explicit_host "postgresql://alice:secret@localhost:5432/gstack_web2skill?sslmode=require" ROLLBACK_DATABASE_URL',
    ].join(" && "))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ROLLBACK_DATABASE_URL must use a non-localhost network host")
  })

  test("builds the exact row-count SQL for a key table", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'build_table_count_sql catalog_items',
    ].join(" && "))

    expect(result.stdout.trim()).toBe('SELECT COUNT(*) FROM "catalog_items"')
  })

  test("builds a pg_restore command with clean/no-owner flags", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'build_pg_restore_command "dump/custom.dump" "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=require"',
    ].join(" && "))

    expect(result.stdout).toContain("pg_restore")
    expect(result.stdout).toContain("--clean --if-exists --no-owner --no-privileges")
    expect(result.stdout).toContain("dump/custom.dump")
  })
})
```

- [ ] **Step 2: Run the helper tests and confirm they fail**

Run: `bun test src/postgresMigration/common.test.ts`
Expected: FAIL with missing file/export errors.

- [ ] **Step 3: Implement the shared env validators and command builders**

```sh
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
```

- [ ] **Step 4: Add the TLS-in-use SQL helper**

```sh
build_ssl_in_use_sql() {
  printf 'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()\n'
}
```

- [ ] **Step 5: Re-run the helper tests**

Run: `bun test src/postgresMigration/common.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/postgres-migration/lib/common.sh src/postgresMigration/common.test.ts
git commit -m "feat: add postgres migration shell helpers"
```

## Task 3: Add the export/import/verification/rollback scripts and wire package scripts

**Files:**
- Modify: `package.json`
- Create: `scripts/postgres-migration/export-local.sh`
- Create: `scripts/postgres-migration/import-remote.sh`
- Create: `scripts/postgres-migration/verify-cutover.sh`
- Create: `scripts/postgres-migration/prepare-rollback.sh`
- Create: `src/postgresMigration/scripts.test.ts`
- Test: `src/postgresMigration/scripts.test.ts`

- [ ] **Step 1: Write the failing operator-script tests**

```ts
import { describe, expect, test } from "bun:test"
import { runShell } from "../bootstrap/testUtils"

describe("postgres migration scripts", () => {
  test("export-local requires LOCAL_DATABASE_URL and DUMP_FILE", async () => {
    const result = await runShell("bash scripts/postgres-migration/export-local.sh")
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required environment variable: LOCAL_DATABASE_URL")
  })

  test("import-remote rejects a target url without sslmode=require", async () => {
    const result = await runShell(
      "bash scripts/postgres-migration/import-remote.sh",
      {
        DUMP_FILE: "dump/custom.dump",
        REMOTE_DATABASE_URL: "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill",
      },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("REMOTE_DATABASE_URL must include sslmode=require")
  })

  test("verify-cutover rejects a target url without sslmode=require", async () => {
    const result = await runShell(
      "bash scripts/postgres-migration/verify-cutover.sh",
      {
        SOURCE_DATABASE_URL: "postgres://bytedance@localhost:5432/gstack_web2skill",
        TARGET_DATABASE_URL: "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill",
      },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("TARGET_DATABASE_URL must include sslmode=require")
  })

  test("prepare-rollback rejects a localhost rollback url", async () => {
    const result = await runShell(
      "bash scripts/postgres-migration/prepare-rollback.sh",
      { ROLLBACK_DATABASE_URL: "postgresql://alice:secret@localhost:5432/gstack_web2skill?sslmode=require" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ROLLBACK_DATABASE_URL must use a non-localhost network host")
  })

  test("package.json exposes the migration entrypoints", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } })
    expect(pkg.default.scripts["db:migration:export-local"]).toBe("bash scripts/postgres-migration/export-local.sh")
    expect(pkg.default.scripts["db:migration:import-remote"]).toBe("bash scripts/postgres-migration/import-remote.sh")
    expect(pkg.default.scripts["db:migration:verify-cutover"]).toBe("bash scripts/postgres-migration/verify-cutover.sh")
    expect(pkg.default.scripts["db:migration:prepare-rollback"]).toBe("bash scripts/postgres-migration/prepare-rollback.sh")
  })
})
```

- [ ] **Step 2: Run the script tests and confirm they fail**

Run: `bun test src/postgresMigration/scripts.test.ts`
Expected: FAIL with missing scripts or missing package entries.

- [ ] **Step 3: Add the operator scripts to `package.json`**

```json
{
  "scripts": {
    "db:migration:export-local": "bash scripts/postgres-migration/export-local.sh",
    "db:migration:import-remote": "bash scripts/postgres-migration/import-remote.sh",
    "db:migration:verify-cutover": "bash scripts/postgres-migration/verify-cutover.sh",
    "db:migration:prepare-rollback": "bash scripts/postgres-migration/prepare-rollback.sh"
  }
}
```

- [ ] **Step 4: Implement `export-local.sh`**

```sh
#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/common.sh"

require_env LOCAL_DATABASE_URL
require_env DUMP_FILE

eval "$(build_pg_dump_command "$DUMP_FILE" "$LOCAL_DATABASE_URL")"
```

- [ ] **Step 5: Implement `import-remote.sh`**

```sh
#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/common.sh"

require_env REMOTE_DATABASE_URL
require_env DUMP_FILE
assert_postgres_url_has_sslmode_require "$REMOTE_DATABASE_URL" REMOTE_DATABASE_URL

eval "$(build_pg_restore_command "$DUMP_FILE" "$REMOTE_DATABASE_URL")"
```

- [ ] **Step 6: Implement `verify-cutover.sh` for the two key tables and TLS check**

```sh
#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/common.sh"

require_env SOURCE_DATABASE_URL
require_env TARGET_DATABASE_URL
assert_postgres_url_has_sslmode_require "$TARGET_DATABASE_URL" TARGET_DATABASE_URL

for table in catalog_items team_shoes_content_templates; do
  source_count="$(psql "$SOURCE_DATABASE_URL" -Atqc "$(build_table_count_sql "$table")")"
  target_count="$(psql "$TARGET_DATABASE_URL" -Atqc "$(build_table_count_sql "$table")")"
  [[ "$source_count" == "$target_count" ]] || die "$table count mismatch: $source_count != $target_count"
done

psql "$TARGET_DATABASE_URL" -Atqc "$(build_ssl_in_use_sql)" | grep -q t
```

- [ ] **Step 7: Implement `prepare-rollback.sh`**

```sh
#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/common.sh"

require_env ROLLBACK_DATABASE_URL
assert_postgres_url_has_sslmode_require "$ROLLBACK_DATABASE_URL" ROLLBACK_DATABASE_URL
assert_database_url_uses_explicit_host "$ROLLBACK_DATABASE_URL" ROLLBACK_DATABASE_URL

psql "$ROLLBACK_DATABASE_URL" -c "select 1" >/dev/null
printf '%s\n' "$ROLLBACK_DATABASE_URL"
```

- [ ] **Step 8: Re-run the script tests**

Run: `bun test src/postgresMigration/scripts.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the migration-focused test slice together**

Run: `bun test src/db/client.test.ts src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json src/postgresMigration/scripts.test.ts scripts/postgres-migration/export-local.sh scripts/postgres-migration/import-remote.sh scripts/postgres-migration/verify-cutover.sh scripts/postgres-migration/prepare-rollback.sh
git commit -m "feat: add postgres migration operator scripts"
```

## Task 4: Write the remote cutover runbook

**Files:**
- Create: `docs/superpowers/runbooks/remote-postgres-cutover.md`

- [ ] **Step 1: Draft the runbook header and prerequisites**

```md
# Remote PostgreSQL Cutover Runbook

## Preconditions
- remote PostgreSQL 16 will listen on port 5432
- remote `DATABASE_URL` includes `sslmode=require`
- deployed machines set `GSTACK_REQUIRE_DATABASE_URL=1`
- a dump directory exists before export commands run: `mkdir -p tmp`
```

- [ ] **Step 2: Add the remote host preparation section**

```md
## Remote host preparation
1. Install PostgreSQL 16 on the remote host.
2. Enable server-side PostgreSQL TLS before any remote connection attempt.
3. Create database `gstack_web2skill`.
4. Create application user `app_user`.
5. Grant runtime-compatible privileges to `app_user`, including the current schema-creation needs from `ensureCatalogSchema()`, while keeping the role non-superuser, non-createdb, and non-createrole.
6. Configure `listen_addresses`, `pg_hba.conf`, and firewall rules for the business-machine IP allowlist.
7. Use `hostssl` + `scram-sha-256` for the application connection policy.
8. Verify connectivity from every business machine to `REMOTE_IP:5432` before rehearsal starts.
9. Verify at least one TLS-backed `psql` connection succeeds with the final remote `DATABASE_URL` before rehearsal starts.
```

- [ ] **Step 3: Add the source inspection section before any rehearsal/import work**

```md
## Source inspection
1. Confirm the source of truth is the current machine's PostgreSQL on port 5432.
2. Confirm schema objects exist as expected for `catalog_items` and `team_shoes_content_templates`.
3. Capture row counts before migration:
   - `psql 'postgres://bytedance@localhost:5432/gstack_web2skill' -Atqc 'SELECT COUNT(*) FROM "catalog_items"'`
   - `psql 'postgres://bytedance@localhost:5432/gstack_web2skill' -Atqc 'SELECT COUNT(*) FROM "team_shoes_content_templates"'`
4. Check for export/import blockers such as unexpected large objects or other anomalies in the source database.
5. Record the exact source connection string that will be reused for rehearsal verification.
```

- [ ] **Step 4: Write the rehearsal section using the package scripts and one controlled app-connectivity test**

```md
## Rehearsal
1. Create the dump directory: `mkdir -p tmp`
2. Export the current machine's local database:
   `LOCAL_DATABASE_URL='postgres://bytedance@localhost:5432/gstack_web2skill' DUMP_FILE=tmp/local.dump bun run db:migration:export-local`
3. Import into the remote database:
   `REMOTE_DATABASE_URL='postgresql://app_user:secret@REMOTE_IP:5432/gstack_web2skill?sslmode=require' DUMP_FILE=tmp/local.dump bun run db:migration:import-remote`
4. Compare key table counts:
   `SOURCE_DATABASE_URL='postgres://bytedance@localhost:5432/gstack_web2skill' TARGET_DATABASE_URL='postgresql://app_user:secret@REMOTE_IP:5432/gstack_web2skill?sslmode=require' bun run db:migration:verify-cutover`
5. Run one controlled application start or smoke test against the remote `DATABASE_URL` to confirm startup/auth/privilege behavior before the real cutover window.
```

- [ ] **Step 5: Write the rollback-readiness section with explicit host/IP, port, TLS, and access-control requirements**

```md
## Rollback readiness
1. Assign one explicit rollback endpoint for the preserved current-machine PostgreSQL instance:
   - `ROLLBACK_HOST=<current-machine-routable-ip>`
   - `ROLLBACK_PORT=5432`
2. Temporarily make that PostgreSQL instance remotely reachable on `ROLLBACK_HOST:ROLLBACK_PORT`.
3. Restrict inbound access to the same business-machine source IP allowlist used for the remote database.
4. Prepare and validate the explicit rollback connection string:
   `ROLLBACK_DATABASE_URL='postgresql://alice:secret@ROLLBACK_HOST:5432/gstack_web2skill?sslmode=require' bun run db:migration:prepare-rollback`
5. Confirm the rollback URL can be reached from each business machine that will switch during cutover.
6. Record and distribute that exact rollback `DATABASE_URL` to every machine that will switch during cutover.
7. Do not start cutover until the exact rollback URL is written into the runbook.
```

- [ ] **Step 6: Write the final cutover section with application-level validation**

```md
## Final cutover
1. Stop writes on the current machine.
2. Confirm no background jobs, workers, or other processes are still writing locally before the final export.
3. Re-run the local export.
4. Re-run the remote import.
5. Switch every business machine to the remote `DATABASE_URL` and keep `GSTACK_REQUIRE_DATABASE_URL=1` set.
6. Restart the application on every switched machine.
7. Run `bun run db:migration:verify-cutover` against source and target.
8. Validate the application on the remote database:
   - app starts without database connection errors
   - reads succeed
   - writes succeed
   - a new write lands in remote PostgreSQL
   - every switched machine uses the same remote `DATABASE_URL`
   - no machine continues writing to the preserved local PostgreSQL instance
```

- [ ] **Step 7: Write the rollback section**

```md
## Rollback
1. Re-point business machines to the prepared rollback `DATABASE_URL`.
2. Keep `GSTACK_REQUIRE_DATABASE_URL=1` set.
3. Restart the application.
4. Confirm app startup, reads, and writes succeed against the preserved current-machine PostgreSQL instance.
5. Confirm no machine is still pointed at the failed remote database.
```

- [ ] **Step 8: Review the runbook against the approved spec and trim anything extra**

Checklist:
- no backup platform work added
- TLS is mandatory everywhere a remote network path is used
- remote host preparation covers TLS setup, database creation, app user creation, non-superuser privileges, network config, and connectivity checks
- rollback uses an explicit network-reachable URL, not `localhost`
- the rollback section defines host/IP, port, access-control changes, explicit URL distribution, and per-machine connectivity confirmation
- source inspection happens before rehearsal/cutover and covers schema + anomaly checks
- rehearsal includes one controlled application connectivity/startup check
- final cutover confirms local writers are fully stopped before the last export
- application startup/read/write/no-split-brain checks are present after cutover
- only `catalog_items` and `team_shoes_content_templates` are required for count verification

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/runbooks/remote-postgres-cutover.md
git commit -m "docs: add remote postgres cutover runbook"
```

## Task 5: Final verification and handoff

**Files:**
- Test: `src/db/client.test.ts`
- Test: `src/postgresMigration/common.test.ts`
- Test: `src/postgresMigration/scripts.test.ts`
- Review: `docs/superpowers/runbooks/remote-postgres-cutover.md`

- [ ] **Step 1: Re-run the focused implementation test suites**

Run: `bun test src/db/client.test.ts src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts`
Expected: PASS.

- [ ] **Step 2: Re-run the full project test suite**

Run: `bun test`
Expected: PASS.

- [ ] **Step 3: Manually review the implementation contract before handoff**

Check:
- deployment machines cannot silently fall back to `localhost` when `GSTACK_REQUIRE_DATABASE_URL=1`
- every remote/rollback URL path enforces `sslmode=require`
- rollback tooling rejects `localhost` rollback URLs
- export/import scripts pin `pg_dump`/`pg_restore` flags to `--no-owner --no-privileges`
- cutover verification compares `catalog_items` and `team_shoes_content_templates`
- the runbook matches the approved spec and does not mutate `setup.sh`

- [ ] **Step 4: Stop here unless a review finds a specific issue**

If review is clean, do not add a catch-all commit. If a small follow-up is required, stage only the exact files changed in that follow-up.

Example:

```bash
git add src/postgresMigration/scripts.test.ts docs/superpowers/runbooks/remote-postgres-cutover.md
git commit -m "test: tighten remote postgres migration checks"
```
