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
