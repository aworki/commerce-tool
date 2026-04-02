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
