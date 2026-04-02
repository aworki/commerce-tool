import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
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

test("ensure_shell_profile creates zsh profile and writes one managed block", async () => {
  const home = mkdtempSync(join(tmpdir(), "bootstrap-zsh-profile-"))

  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/profile.sh",
    `HOME="${home}" LOGIN_SHELL_NAME=zsh DATABASE_URL="postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433" BUN_PROFILE_EXPORTS='' ensure_shell_profile`,
  ].join(" && "))

  expect(result.exitCode).toBe(0)
  const profile = readFileSync(join(home, ".zshrc"), "utf8")
  expect(profile).toContain('# >>> gstack-web2skill bootstrap >>>')
  expect(profile).toContain('export DATABASE_URL="postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433"')
})

test("ensure_shell_profile does not duplicate an existing managed block", async () => {
  const home = mkdtempSync(join(tmpdir(), "bootstrap-zsh-profile-idempotent-"))
  const profilePath = join(home, ".zshrc")
  writeFileSync(profilePath, '# >>> gstack-web2skill bootstrap >>>\nexport DATABASE_URL="old"\n# <<< gstack-web2skill bootstrap <<<\n')

  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/profile.sh",
    `HOME="${home}" LOGIN_SHELL_NAME=zsh DATABASE_URL="postgresql://alice@/gstack_web2skill?host=/tmp/pg&port=5433" BUN_PROFILE_EXPORTS='' ensure_shell_profile`,
  ].join(" && "))

  expect(result.exitCode).toBe(0)
  const profile = readFileSync(profilePath, "utf8")
  expect(profile.match(/# >>> gstack-web2skill bootstrap >>>/g)?.length ?? 0).toBe(1)
})

test("rollback removes a bootstrap-created profile file", async () => {
  const home = mkdtempSync(join(tmpdir(), "bootstrap-created-profile-"))
  const profile = join(home, ".zshrc")
  writeFileSync(profile, '# >>> gstack-web2skill bootstrap >>>\n# <<< gstack-web2skill bootstrap <<<\n')

  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/profile.sh",
    `PROFILE_TARGET="${profile}" PROFILE_CREATED_BY_BOOTSTRAP=1 rollback_profile_changes`,
  ].join(" && "))

  expect(result.exitCode).toBe(0)
  expect(existsSync(profile)).toBe(false)
})
