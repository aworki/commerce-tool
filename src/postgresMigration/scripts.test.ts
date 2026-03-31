import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runShell } from "../bootstrap/testUtils"

const localDatabaseUrl = "postgresql://local_user:secret@192.168.1.10:5432/gstack_web2skill"
const remoteDatabaseUrl = "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=require"
const sourceDatabaseUrl = "postgresql://source_user:secret@10.0.0.7:5432/gstack_web2skill"
const rollbackDatabaseUrl = "postgresql://alice:secret@10.0.0.9:5432/gstack_web2skill?sslmode=require"

let stubDir = ""
let stubLogFile = ""

beforeEach(async () => {
  stubDir = await mkdtemp(join(tmpdir(), "postgres-migration-stubs-"))
  stubLogFile = join(stubDir, "command-log.jsonl")
  await writeFile(stubLogFile, "")
})

afterEach(async () => {
  if (stubDir) {
    await rm(stubDir, { recursive: true, force: true })
  }
})

async function installStub(commandName: string, body = "") {
  const scriptPath = join(stubDir, commandName)
  await writeFile(
    scriptPath,
    `#!/usr/bin/env bash
set -euo pipefail
python3 - "$STUB_LOG_FILE" "\${0##*/}" "$@" <<'PY'
import json
import sys
with open(sys.argv[1], "a", encoding="utf-8") as handle:
    json.dump(sys.argv[2:], handle)
    handle.write("\\n")
PY
${body}`,
  )
  await chmod(scriptPath, 0o755)
}

async function readStubLog() {
  const content = await readFile(stubLogFile, "utf8")
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[])
}

function withStubbedPath(env: Record<string, string> = {}) {
  return {
    ...env,
    PATH: `${stubDir}:${process.env.PATH ?? ""}`,
    STUB_LOG_FILE: stubLogFile,
  }
}

describe("postgres migration scripts", () => {
  test("export-local requires LOCAL_DATABASE_URL and DUMP_FILE", async () => {
    const result = await runShell("bash scripts/postgres-migration/export-local.sh")
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required environment variable: LOCAL_DATABASE_URL")
  })

  test("export-local invokes pg_dump with the operator-facing flags", async () => {
    await installStub("pg_dump")

    const result = await runShell(
      "bash scripts/postgres-migration/export-local.sh",
      withStubbedPath({
        DUMP_FILE: "dump/custom backup.dump",
        LOCAL_DATABASE_URL: localDatabaseUrl,
      }),
    )

    expect(result.exitCode).toBe(0)
    expect(await readStubLog()).toEqual([
      [
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file",
        "dump/custom backup.dump",
        localDatabaseUrl,
      ],
    ])
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

  test("import-remote rejects a localhost target url before invoking pg_restore", async () => {
    await installStub("pg_restore")

    const result = await runShell(
      "bash scripts/postgres-migration/import-remote.sh",
      withStubbedPath({
        DUMP_FILE: "dump/custom.dump",
        REMOTE_DATABASE_URL: "postgresql://app_user:secret@localhost:5432/gstack_web2skill?sslmode=require",
      }),
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("REMOTE_DATABASE_URL must use a non-localhost network host")
    expect(await readStubLog()).toEqual([])
  })

  test("import-remote invokes pg_restore with the restore contract flags", async () => {
    await installStub("pg_restore")

    const result = await runShell(
      "bash scripts/postgres-migration/import-remote.sh",
      withStubbedPath({
        DUMP_FILE: "dump/custom restore.dump",
        REMOTE_DATABASE_URL: remoteDatabaseUrl,
      }),
    )

    expect(result.exitCode).toBe(0)
    expect(await readStubLog()).toEqual([
      [
        "pg_restore",
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        remoteDatabaseUrl,
        "dump/custom restore.dump",
      ],
    ])
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

  test("verify-cutover rejects a localhost target url before invoking psql", async () => {
    await installStub("psql")

    const result = await runShell(
      "bash scripts/postgres-migration/verify-cutover.sh",
      withStubbedPath({
        SOURCE_DATABASE_URL: sourceDatabaseUrl,
        TARGET_DATABASE_URL: "postgresql://app_user:secret@127.0.0.1:5432/gstack_web2skill?sslmode=require",
      }),
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("TARGET_DATABASE_URL must use a non-localhost network host")
    expect(await readStubLog()).toEqual([])
  })

  test("verify-cutover checks both key tables and confirms TLS is active", async () => {
    await installStub(
      "psql",
      `query="\${!#}"
case "$query" in
  'SELECT COUNT(*) FROM "catalog_items"')
    printf '12\n'
    ;;
  'SELECT COUNT(*) FROM "team_shoes_content_templates"')
    printf '3\n'
    ;;
  'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')
    printf 't\n'
    ;;
  *)
    printf 'unexpected psql query: %s\n' "$query" >&2
    exit 1
    ;;
esac
`,
    )

    const result = await runShell(
      "bash scripts/postgres-migration/verify-cutover.sh",
      withStubbedPath({
        SOURCE_DATABASE_URL: sourceDatabaseUrl,
        TARGET_DATABASE_URL: remoteDatabaseUrl,
      }),
    )

    expect(result.exitCode).toBe(0)
    expect(await readStubLog()).toEqual([
      ["psql", sourceDatabaseUrl, "-Atqc", 'SELECT COUNT(*) FROM "catalog_items"'],
      ["psql", remoteDatabaseUrl, "-Atqc", 'SELECT COUNT(*) FROM "catalog_items"'],
      ["psql", sourceDatabaseUrl, "-Atqc", 'SELECT COUNT(*) FROM "team_shoes_content_templates"'],
      ["psql", remoteDatabaseUrl, "-Atqc", 'SELECT COUNT(*) FROM "team_shoes_content_templates"'],
      ["psql", remoteDatabaseUrl, "-Atqc", "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()"],
    ])
  })

  test("prepare-rollback rejects a localhost rollback url", async () => {
    const result = await runShell(
      "bash scripts/postgres-migration/prepare-rollback.sh",
      { ROLLBACK_DATABASE_URL: "postgresql://alice:secret@localhost:5432/gstack_web2skill?sslmode=require" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ROLLBACK_DATABASE_URL must use a non-localhost network host")
  })

  test("prepare-rollback prints the rollback url after the connectivity probe succeeds", async () => {
    await installStub(
      "psql",
      `query="\${!#}"
[[ "$query" == "select 1" ]] || {
  printf 'unexpected psql query: %s\n' "$query" >&2
  exit 1
}
`,
    )

    const result = await runShell(
      "bash scripts/postgres-migration/prepare-rollback.sh",
      withStubbedPath({ ROLLBACK_DATABASE_URL: rollbackDatabaseUrl }),
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(rollbackDatabaseUrl)
    expect(await readStubLog()).toEqual([["psql", rollbackDatabaseUrl, "-c", "select 1"]])
  })

  test("package.json exposes the migration entrypoints", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } })
    expect(pkg.default.scripts["db:migration:export-local"]).toBe("bash scripts/postgres-migration/export-local.sh")
    expect(pkg.default.scripts["db:migration:import-remote"]).toBe("bash scripts/postgres-migration/import-remote.sh")
    expect(pkg.default.scripts["db:migration:verify-cutover"]).toBe("bash scripts/postgres-migration/verify-cutover.sh")
    expect(pkg.default.scripts["db:migration:prepare-rollback"]).toBe("bash scripts/postgres-migration/prepare-rollback.sh")
  })
})
