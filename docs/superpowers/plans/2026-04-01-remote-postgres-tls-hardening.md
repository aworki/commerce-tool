# Remote PostgreSQL TLS Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current self-signed PostgreSQL runtime setup with CA-backed, strictly verified TLS that works from multiple client machines and from this repository’s `pg` runtime.

**Architecture:** Keep the existing PostgreSQL host, role, and database, but add one focused TypeScript TLS helper for `pg`, tighten the shell migration helpers to require `sslmode=verify-full` plus a CA file, and add repeatable operator scripts for generating and verifying the PostgreSQL server certificate. Update the cutover runbook so the repository’s documented and tested connection contract matches the final strict TLS design.

**Tech Stack:** Bun, TypeScript, `pg`, Bash, OpenSSL, PostgreSQL 16

---

## File Structure

- Create: `src/db/tls.ts` — centralizes remote-database detection and CA-backed `pg` SSL config creation.
- Create: `src/db/tls.test.ts` — unit tests for `src/db/tls.ts`.
- Modify: `src/db/client.ts` — keeps `DATABASE_URL` selection, exports pool-config construction, and passes strict TLS config into `Pool`.
- Modify: `src/db/client.test.ts` — updates URL expectations to `sslmode=verify-full` and adds pool-config coverage.
- Modify: `scripts/postgres-migration/lib/common.sh` — adds strict TLS URL validation and readable-file validation helpers.
- Modify: `scripts/postgres-migration/import-remote.sh` — requires CA file and uses it for remote `pg_restore`.
- Modify: `scripts/postgres-migration/verify-cutover.sh` — requires CA file and uses it for remote `psql` verification.
- Modify: `scripts/postgres-migration/prepare-rollback.sh` — requires CA file and uses it for remote rollback verification.
- Create: `scripts/postgres-migration/generate-server-tls.sh` — generates an internal CA and an IP-SAN PostgreSQL server certificate locally on the operator machine.
- Create: `scripts/postgres-migration/verify-server-tls.sh` — verifies the remote PostgreSQL server presents the CA-signed certificate for `101.47.12.162`.
- Modify: `src/postgresMigration/common.test.ts` — updates shell-helper tests for `sslmode=verify-full` and readable CA file requirements.
- Modify: `src/postgresMigration/scripts.test.ts` — updates migration-script tests for CA-file requirements and new TLS entrypoints.
- Modify: `package.json` — exposes the new TLS scripts under `bun run`.
- Modify: `docs/superpowers/runbooks/remote-postgres-cutover.md` — replaces `sslmode=require` operator guidance with strict CA-backed `verify-full` guidance.

### Task 1: Add a focused `pg` TLS helper

**Files:**
- Create: `src/db/tls.ts`
- Test: `src/db/tls.test.ts`

- [ ] **Step 1: Write the failing TLS helper tests**

```ts
import { describe, expect, test } from "bun:test"
import { buildDatabaseSslConfig, isRemoteDatabaseUrl } from "./tls"

describe("isRemoteDatabaseUrl", () => {
  test("returns false for localhost urls", () => {
    expect(isRemoteDatabaseUrl("postgres://bytedance@localhost:5432/gstack_web2skill")).toBe(false)
  })

  test("returns true for remote network urls", () => {
    expect(isRemoteDatabaseUrl("postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full")).toBe(true)
  })
})

describe("buildDatabaseSslConfig", () => {
  test("returns undefined for localhost connections", () => {
    expect(buildDatabaseSslConfig("postgres://bytedance@localhost:5432/gstack_web2skill")).toBeUndefined()
  })

  test("throws when a remote database url is missing DATABASE_SSL_CA_CERT_PATH", () => {
    expect(() => buildDatabaseSslConfig(
      "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      {} as NodeJS.ProcessEnv,
      () => "unused",
    )).toThrow("DATABASE_SSL_CA_CERT_PATH is required for remote PostgreSQL TLS")
  })

  test("loads CA text and enables strict verification for remote urls", () => {
    expect(buildDatabaseSslConfig(
      "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      { DATABASE_SSL_CA_CERT_PATH: "/tmp/gstack-pg-tls/internal-ca.pem" } as NodeJS.ProcessEnv,
      (path) => {
        expect(path).toBe("/tmp/gstack-pg-tls/internal-ca.pem")
        return "CA_TEXT"
      },
    )).toEqual({
      ca: "CA_TEXT",
      rejectUnauthorized: true,
    })
  })
})
```

- [ ] **Step 2: Run the TLS helper tests to confirm they fail**

Run: `bun test src/db/tls.test.ts`

Expected: FAIL with a module-not-found or missing-export error for `./tls`.

- [ ] **Step 3: Write the minimal TLS helper implementation**

```ts
import { readFileSync } from "node:fs"

type ReadCaFile = (path: string) => string

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

export function isRemoteDatabaseUrl(databaseUrl: string): boolean {
  return !LOCAL_DATABASE_HOSTS.has(new URL(databaseUrl).hostname)
}

export function getRequiredDatabaseCaCertPath(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_SSL_CA_CERT_PATH?.trim()
  if (!value) {
    throw new Error("DATABASE_SSL_CA_CERT_PATH is required for remote PostgreSQL TLS")
  }
  return value
}

export function buildDatabaseSslConfig(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  readCaFile: ReadCaFile = (path) => readFileSync(path, "utf8"),
) {
  if (!isRemoteDatabaseUrl(databaseUrl)) return undefined

  return {
    ca: readCaFile(getRequiredDatabaseCaCertPath(env)),
    rejectUnauthorized: true as const,
  }
}
```

- [ ] **Step 4: Re-run the TLS helper tests**

Run: `bun test src/db/tls.test.ts`

Expected: PASS with 5 passing tests.

- [ ] **Step 5: Commit the helper-only change**

```bash
git add src/db/tls.ts src/db/tls.test.ts
git commit -m "feat(db): add CA-backed postgres TLS helper"
```

### Task 2: Wire the database client to strict verified TLS

**Files:**
- Modify: `src/db/client.ts`
- Modify: `src/db/client.test.ts`
- Reuse: `src/db/tls.ts`
- Test: `src/db/client.test.ts`

- [ ] **Step 1: Extend the client tests first**

```ts
import { describe, expect, test } from "bun:test"
import { buildDatabasePoolConfig, getDatabaseUrl } from "./client"

describe("getDatabaseUrl", () => {
  test("returns the explicit remote DATABASE_URL when provided", () => {
    expect(getDatabaseUrl({
      DATABASE_URL: "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
    } as NodeJS.ProcessEnv)).toBe(
      "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
    )
  })

  test("throws when deployment mode requires DATABASE_URL but it is missing", () => {
    expect(() => getDatabaseUrl({ GSTACK_REQUIRE_DATABASE_URL: "1" } as NodeJS.ProcessEnv)).toThrow(
      "DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1",
    )
  })

  test("throws when deployment mode requires DATABASE_URL but it is blank", () => {
    expect(() => getDatabaseUrl({
      GSTACK_REQUIRE_DATABASE_URL: "1",
      DATABASE_URL: "   ",
    } as NodeJS.ProcessEnv)).toThrow(
      "DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1",
    )
  })

  test("keeps the current localhost fallback for non-deployment environments", () => {
    expect(getDatabaseUrl({} as NodeJS.ProcessEnv)).toBe(
      "postgres://bytedance@localhost:5432/gstack_web2skill",
    )
  })
})

describe("buildDatabasePoolConfig", () => {
  test("adds strict TLS config for remote DATABASE_URL values", () => {
    expect(buildDatabasePoolConfig({
      DATABASE_URL: "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      DATABASE_SSL_CA_CERT_PATH: "/tmp/gstack-pg-tls/internal-ca.pem",
    } as NodeJS.ProcessEnv, (path) => {
      expect(path).toBe("/tmp/gstack-pg-tls/internal-ca.pem")
      return "CA_TEXT"
    })).toEqual({
      connectionString: "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      ssl: {
        ca: "CA_TEXT",
        rejectUnauthorized: true,
      },
    })
  })

  test("keeps local fallback connections non-TLS-configured", () => {
    expect(buildDatabasePoolConfig({} as NodeJS.ProcessEnv, () => {
      throw new Error("should not read a CA file for localhost")
    })).toEqual({
      connectionString: "postgres://bytedance@localhost:5432/gstack_web2skill",
    })
  })
})
```

- [ ] **Step 2: Run the client tests to verify the new assertions fail**

Run: `bun test src/db/client.test.ts src/db/tls.test.ts`

Expected: FAIL with a missing export for `buildDatabasePoolConfig` and unchanged `sslmode=require` expectations.

- [ ] **Step 3: Implement the client wiring**

```ts
import { Pool } from "pg"
import { buildDatabaseSslConfig } from "./tls"

const DEFAULT_DATABASE_URL = "postgres://bytedance@localhost:5432/gstack_web2skill"

let pool: Pool | undefined

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const explicitDatabaseUrl = env.DATABASE_URL?.trim()
  if (explicitDatabaseUrl) return explicitDatabaseUrl

  if (env.GSTACK_REQUIRE_DATABASE_URL === "1") {
    throw new Error("DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1")
  }

  return DEFAULT_DATABASE_URL
}

export function buildDatabasePoolConfig(
  env: NodeJS.ProcessEnv = process.env,
  readCaFile?: (path: string) => string,
) {
  const connectionString = getDatabaseUrl(env)
  const ssl = buildDatabaseSslConfig(connectionString, env, readCaFile)

  return ssl ? { connectionString, ssl } : { connectionString }
}

export function getDb() {
  pool ??= new Pool(buildDatabasePoolConfig())
  return pool
}
```

- [ ] **Step 4: Re-run the client tests**

Run: `bun test src/db/client.test.ts src/db/tls.test.ts`

Expected: PASS with all DB config tests green.

- [ ] **Step 5: Commit the client wiring**

```bash
git add src/db/client.ts src/db/client.test.ts src/db/tls.ts src/db/tls.test.ts
git commit -m "feat(db): require CA file for remote postgres TLS"
```

### Task 3: Tighten the migration shell contract to `verify-full` plus CA file validation

**Files:**
- Modify: `scripts/postgres-migration/lib/common.sh`
- Modify: `scripts/postgres-migration/import-remote.sh`
- Modify: `scripts/postgres-migration/verify-cutover.sh`
- Modify: `scripts/postgres-migration/prepare-rollback.sh`
- Modify: `src/postgresMigration/common.test.ts`
- Modify: `src/postgresMigration/scripts.test.ts`

- [ ] **Step 1: Update the shell tests first**

```ts
const remoteDatabaseUrl = "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=verify-full"
const rollbackDatabaseUrl = "postgresql://alice:secret@10.0.0.9:5432/gstack_web2skill?sslmode=verify-full"

test("rejects a postgres url that does not include sslmode=verify-full", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/postgres-migration/lib/common.sh",
    'assert_postgres_url_has_sslmode_verify_full "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=require" REMOTE_DATABASE_URL',
  ].join(" && "))

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("REMOTE_DATABASE_URL must include sslmode=verify-full")
})

test("rejects a missing CA file path before invoking pg_restore", async () => {
  const result = await runShell(
    "bash scripts/postgres-migration/import-remote.sh",
    {
      DUMP_FILE: "dump/custom.dump",
      REMOTE_DATABASE_URL: remoteDatabaseUrl,
    },
  )

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Missing required environment variable: DATABASE_SSL_CA_CERT_PATH")
})

test("passes PGSSLROOTCERT to pg_restore", async () => {
  await installStub("pg_restore", 'printf "PGSSLROOTCERT=%s\n" "$PGSSLROOTCERT"')

  const result = await runShell(
    "bash scripts/postgres-migration/import-remote.sh",
    withStubbedPath({
      DUMP_FILE: "dump/custom restore.dump",
      REMOTE_DATABASE_URL: remoteDatabaseUrl,
      DATABASE_SSL_CA_CERT_PATH: "/tmp/gstack-pg-tls/internal-ca.pem",
    }),
  )

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("PGSSLROOTCERT=/tmp/gstack-pg-tls/internal-ca.pem")
})
```

- [ ] **Step 2: Run the shell-helper test files and confirm the old helpers fail**

Run: `bun test src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts`

Expected: FAIL because the code still expects `sslmode=require` and does not require `DATABASE_SSL_CA_CERT_PATH`.

- [ ] **Step 3: Implement the stricter shell helpers and script wiring**

```bash
# scripts/postgres-migration/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/bootstrap/lib/common.sh"

require_env() {
  [[ -n "${!1:-}" ]] || die "Missing required environment variable: $1"
}

require_readable_file() {
  [[ -r "$2" ]] || die "$1 must point to a readable file: $2"
}

assert_postgres_url_has_sslmode_verify_full() {
  case "$1" in
    *[\?\&]sslmode=verify-full|*[\?\&]sslmode=verify-full\&*) ;;
    *) die "$2 must include sslmode=verify-full" ;;
  esac
}

assert_database_url_uses_explicit_host() {
  case "$1" in
    *"@localhost:"*|*"@127.0.0.1:"*|*@[::1]:*) die "$2 must use a non-localhost network host" ;;
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
```

```bash
# scripts/postgres-migration/import-remote.sh
#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env REMOTE_DATABASE_URL
require_env DUMP_FILE
require_env DATABASE_SSL_CA_CERT_PATH
require_readable_file DATABASE_SSL_CA_CERT_PATH "$DATABASE_SSL_CA_CERT_PATH"
assert_postgres_url_has_sslmode_verify_full "$REMOTE_DATABASE_URL" REMOTE_DATABASE_URL
assert_database_url_uses_explicit_host "$REMOTE_DATABASE_URL" REMOTE_DATABASE_URL

PGSSLROOTCERT="$DATABASE_SSL_CA_CERT_PATH" eval "$(build_pg_restore_command "$DUMP_FILE" "$REMOTE_DATABASE_URL")"
```

```bash
# scripts/postgres-migration/verify-cutover.sh
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
```

```bash
# scripts/postgres-migration/prepare-rollback.sh
#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env ROLLBACK_DATABASE_URL
require_env DATABASE_SSL_CA_CERT_PATH
require_readable_file DATABASE_SSL_CA_CERT_PATH "$DATABASE_SSL_CA_CERT_PATH"
assert_postgres_url_has_sslmode_verify_full "$ROLLBACK_DATABASE_URL" ROLLBACK_DATABASE_URL
assert_database_url_uses_explicit_host "$ROLLBACK_DATABASE_URL" ROLLBACK_DATABASE_URL

PGSSLROOTCERT="$DATABASE_SSL_CA_CERT_PATH" psql "$ROLLBACK_DATABASE_URL" -c "select 1" >/dev/null
printf '%s\n' "$ROLLBACK_DATABASE_URL"
```

- [ ] **Step 4: Re-run the shell tests**

Run: `bun test src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts`

Expected: PASS with the migration helpers now enforcing `verify-full` and the CA-file contract.

- [ ] **Step 5: Commit the shell migration tightening**

```bash
git add scripts/postgres-migration/lib/common.sh scripts/postgres-migration/import-remote.sh scripts/postgres-migration/verify-cutover.sh scripts/postgres-migration/prepare-rollback.sh src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts
git commit -m "feat(postgres): require verified TLS for migration flows"
```

### Task 4: Add repeatable operator scripts for certificate generation and server verification

**Files:**
- Create: `scripts/postgres-migration/generate-server-tls.sh`
- Create: `scripts/postgres-migration/verify-server-tls.sh`
- Modify: `src/postgresMigration/scripts.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing tests for the new operator entrypoints**

```ts
test("generate-server-tls requires OUTPUT_DIR and POSTGRES_SERVER_IP", async () => {
  const result = await runShell("bash scripts/postgres-migration/generate-server-tls.sh")
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Missing required environment variable: OUTPUT_DIR")
})

test("verify-server-tls requires DATABASE_SSL_CA_CERT_PATH", async () => {
  const result = await runShell(
    "bash scripts/postgres-migration/verify-server-tls.sh",
    { POSTGRES_SERVER_IP: "101.47.12.162" },
  )
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Missing required environment variable: DATABASE_SSL_CA_CERT_PATH")
})

test("package.json exposes the TLS helper entrypoints", async () => {
  const pkg = await import("../../package.json", { with: { type: "json" } })
  expect(pkg.default.scripts["db:migration:generate-server-tls"]).toBe("bash scripts/postgres-migration/generate-server-tls.sh")
  expect(pkg.default.scripts["db:migration:verify-server-tls"]).toBe("bash scripts/postgres-migration/verify-server-tls.sh")
})
```

- [ ] **Step 2: Run the script tests to verify the new entrypoints do not exist yet**

Run: `bun test src/postgresMigration/scripts.test.ts`

Expected: FAIL because the new scripts and package.json entries are missing.

- [ ] **Step 3: Implement the operator TLS scripts and package entries**

```bash
# scripts/postgres-migration/generate-server-tls.sh
#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env OUTPUT_DIR
require_env POSTGRES_SERVER_IP

mkdir -p "$OUTPUT_DIR"

cat > "$OUTPUT_DIR/server-ext.cnf" <<EOF
subjectAltName = IP:${POSTGRES_SERVER_IP}
extendedKeyUsage = serverAuth
EOF

openssl genrsa -out "$OUTPUT_DIR/internal-ca.key" 4096
openssl req -x509 -new -nodes -key "$OUTPUT_DIR/internal-ca.key" -sha256 -days 3650 -out "$OUTPUT_DIR/internal-ca.pem" -subj "/CN=gstack-web2skill-postgres-ca"
openssl genrsa -out "$OUTPUT_DIR/server.key" 4096
chmod 600 "$OUTPUT_DIR/server.key"
openssl req -new -key "$OUTPUT_DIR/server.key" -out "$OUTPUT_DIR/server.csr" -subj "/CN=${POSTGRES_SERVER_IP}"
openssl x509 -req -in "$OUTPUT_DIR/server.csr" -CA "$OUTPUT_DIR/internal-ca.pem" -CAkey "$OUTPUT_DIR/internal-ca.key" -CAcreateserial -out "$OUTPUT_DIR/server.crt" -days 825 -sha256 -extfile "$OUTPUT_DIR/server-ext.cnf"

printf '%s\n' "$OUTPUT_DIR/internal-ca.pem"
printf '%s\n' "$OUTPUT_DIR/server.crt"
printf '%s\n' "$OUTPUT_DIR/server.key"
```

```bash
# scripts/postgres-migration/verify-server-tls.sh
#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env POSTGRES_SERVER_IP
require_env DATABASE_SSL_CA_CERT_PATH
require_readable_file DATABASE_SSL_CA_CERT_PATH "$DATABASE_SSL_CA_CERT_PATH"

san_output="$(openssl s_client -starttls postgres -connect "${POSTGRES_SERVER_IP}:5432" -verify_return_error -CAfile "$DATABASE_SSL_CA_CERT_PATH" < /dev/null 2>/dev/null | openssl x509 -noout -ext subjectAltName)"
printf '%s\n' "$san_output"
printf '%s\n' "$san_output" | grep -F "IP Address:${POSTGRES_SERVER_IP}" >/dev/null
```

```json
{
  "scripts": {
    "db:migration:generate-server-tls": "bash scripts/postgres-migration/generate-server-tls.sh",
    "db:migration:verify-server-tls": "bash scripts/postgres-migration/verify-server-tls.sh"
  }
}
```

- [ ] **Step 4: Re-run the script tests**

Run: `bun test src/postgresMigration/scripts.test.ts`

Expected: PASS with the new TLS entrypoints covered.

- [ ] **Step 5: Commit the operator TLS scripts**

```bash
git add scripts/postgres-migration/generate-server-tls.sh scripts/postgres-migration/verify-server-tls.sh src/postgresMigration/scripts.test.ts package.json
git commit -m "feat(postgres): add repeatable TLS operator scripts"
```

### Task 5: Update the operator runbook and perform end-to-end verification

**Files:**
- Modify: `docs/superpowers/runbooks/remote-postgres-cutover.md`
- Modify: `.env`
- Verify: `src/db/client.test.ts`, `src/db/tls.test.ts`, `src/postgresMigration/common.test.ts`, `src/postgresMigration/scripts.test.ts`

- [ ] **Step 1: Update the cutover runbook text first**

```md
- `REMOTE_DATABASE_URL='postgresql://app_user:CnDjAt3hVFeOiC7PjedAuxoc@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full'`
- `DATABASE_SSL_CA_CERT_PATH='/tmp/gstack-pg-tls/internal-ca.pem'`

9. Verify at least one TLS-backed `psql` connection succeeds with the final remote `DATABASE_URL` before rehearsal starts:
   ```bash
   PGSSLROOTCERT="$DATABASE_SSL_CA_CERT_PATH" psql "$REMOTE_DATABASE_URL" -c 'select version()'
   ```

53. REMOTE_DATABASE_URL="$REMOTE_DATABASE_URL" DATABASE_SSL_CA_CERT_PATH="$DATABASE_SSL_CA_CERT_PATH" bun run db:migration:import-remote
57. SOURCE_DATABASE_URL='postgres://bytedance@localhost:5432/gstack_web2skill' TARGET_DATABASE_URL="$REMOTE_DATABASE_URL" DATABASE_SSL_CA_CERT_PATH="$DATABASE_SSL_CA_CERT_PATH" bun run db:migration:verify-cutover
70. ROLLBACK_DATABASE_URL="$ROLLBACK_DATABASE_URL" DATABASE_SSL_CA_CERT_PATH="$DATABASE_SSL_CA_CERT_PATH" bun run db:migration:prepare-rollback
```

- [ ] **Step 2: Write the final runtime `.env` values on the current machine**

```env
DATABASE_URL=postgresql://app_user:CnDjAt3hVFeOiC7PjedAuxoc@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full
REMOTE_DATABASE_URL=postgresql://app_user:CnDjAt3hVFeOiC7PjedAuxoc@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full
DATABASE_SSL_CA_CERT_PATH=/tmp/gstack-pg-tls/internal-ca.pem
GSTACK_REQUIRE_DATABASE_URL=1
```

- [ ] **Step 3: Run the full automated test suite for the touched areas**

Run: `bun test src/db/client.test.ts src/db/tls.test.ts src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts`

Expected: PASS with all TLS-related unit and shell tests green.

- [ ] **Step 4: Run one real connection verification from this repo using the CA file**

Run:

```bash
cd "/Users/bytedance/Desktop/business/commerce-tool" && node <<'NODE'
const { readFileSync } = require("node:fs")
const { Client } = require("pg")

const client = new Client({
  connectionString: "postgresql://app_user:CnDjAt3hVFeOiC7PjedAuxoc@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
  ssl: {
    ca: readFileSync("/tmp/gstack-pg-tls/internal-ca.pem", "utf8"),
    rejectUnauthorized: true,
  },
})

async function main() {
  await client.connect()
  const result = await client.query("select current_user, current_database()")
  console.log(JSON.stringify(result.rows[0]))
  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
NODE
```

Expected: PASS and print `{"current_user":"app_user","current_database":"gstack_web2skill"}`.

- [ ] **Step 5: Commit the docs and final config contract update**

```bash
git add docs/superpowers/runbooks/remote-postgres-cutover.md .env package.json scripts/postgres-migration/generate-server-tls.sh scripts/postgres-migration/verify-server-tls.sh scripts/postgres-migration/lib/common.sh scripts/postgres-migration/import-remote.sh scripts/postgres-migration/verify-cutover.sh scripts/postgres-migration/prepare-rollback.sh src/db/client.ts src/db/client.test.ts src/db/tls.ts src/db/tls.test.ts src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts
git commit -m "docs: finalize verified TLS postgres rollout contract"
```

## Self-Review Checklist

- Spec coverage mapped:
  - internal CA + IP SAN server certificate → Task 4
  - strict `pg` verification with CA file → Tasks 1-2
  - migration and rollback shell contract hardening → Task 3
  - operator runbook and final runtime contract → Task 5
- Placeholder scan complete: no `TODO`, `TBD`, or unnamed file references remain.
- Type and naming consistency checked:
  - `DATABASE_SSL_CA_CERT_PATH` is the only CA-path env name
  - `sslmode=verify-full` is the only accepted remote TLS URL mode
  - `buildDatabaseSslConfig` and `buildDatabasePoolConfig` are used consistently across tasks
