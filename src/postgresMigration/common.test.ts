import { describe, expect, test } from "bun:test"
import { runShell } from "../bootstrap/testUtils"

describe("postgres migration common helpers", () => {
  test("rejects an empty required env var", async () => {
    const result = await runShell(
      [
        "source scripts/bootstrap/lib/common.sh",
        "source scripts/postgres-migration/lib/common.sh",
        'require_env REMOTE_DATABASE_URL',
      ].join(" && "),
      { REMOTE_DATABASE_URL: "" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required environment variable: REMOTE_DATABASE_URL")
  })

  test("rejects a postgres url that does not include sslmode=verify-full", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'assert_postgres_url_has_sslmode_verify_full "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=require" REMOTE_DATABASE_URL',
    ].join(" && "))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("REMOTE_DATABASE_URL must include sslmode=verify-full")
  })

  test("rejects a postgres url with malformed sslmode=verify-full values", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'assert_postgres_url_has_sslmode_verify_full "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=verify-fulla" REMOTE_DATABASE_URL',
    ].join(" && "))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("REMOTE_DATABASE_URL must include sslmode=verify-full")
  })

  test("rejects a missing readable CA file", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'require_readable_file DATABASE_SSL_CA_CERT_PATH /tmp/does-not-exist.pem',
    ].join(" && "))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("DATABASE_SSL_CA_CERT_PATH must point to a readable file: /tmp/does-not-exist.pem")
  })

  test("rejects rollback urls that still point at localhost", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'assert_database_url_uses_explicit_host "postgresql://alice:secret@localhost:5432/gstack_web2skill?sslmode=verify-full" ROLLBACK_DATABASE_URL',
    ].join(" && "))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ROLLBACK_DATABASE_URL must use a non-localhost network host")
  })

  test("rejects rollback urls that still point at 127.0.0.1", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'assert_database_url_uses_explicit_host "postgresql://alice:secret@127.0.0.1:5432/gstack_web2skill?sslmode=verify-full" ROLLBACK_DATABASE_URL',
    ].join(" && "))

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("ROLLBACK_DATABASE_URL must use a non-localhost network host")
  })

  test("rejects rollback urls that still point at IPv6 loopback", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'assert_database_url_uses_explicit_host "postgresql://alice:secret@[::1]:5432/gstack_web2skill?sslmode=verify-full" ROLLBACK_DATABASE_URL',
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

  test("builds the exact pg_dump command with shell-escaped arguments", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'build_pg_dump_command "dump/custom backup.dump" "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=verify-full"',
    ].join(" && "))

    expect(result.stdout.trim()).toBe(
      "pg_dump --format=custom --no-owner --no-privileges --file dump/custom\\ backup.dump postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill\\?sslmode=verify-full",
    )
  })

  test("builds the exact pg_restore command with shell-escaped arguments", async () => {
    const result = await runShell([
      "source scripts/bootstrap/lib/common.sh",
      "source scripts/postgres-migration/lib/common.sh",
      'build_pg_restore_command "dump/custom restore.dump" "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=verify-full"',
    ].join(" && "))

    expect(result.stdout.trim()).toBe(
      "pg_restore --clean --if-exists --no-owner --no-privileges --dbname postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill\\?sslmode=verify-full dump/custom\\ restore.dump",
    )
  })
})
