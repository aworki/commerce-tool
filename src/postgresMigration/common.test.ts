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

  test("builds the exact TLS-in-use SQL", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'build_ssl_in_use_sql',
    ].join(" && "))

    expect(result.stdout.trim()).toBe("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()")
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
