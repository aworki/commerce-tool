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

test("compute_bun_profile_exports omits exports when bun comes from homebrew", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/install.sh",
    'compute_bun_profile_exports "/opt/homebrew/bin/bun"',
  ].join(" && "))

  expect(result.exitCode).toBe(0)
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

test("compute_bun_profile_exports emits exports for ~/.bun installs", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/install.sh",
    'compute_bun_profile_exports "$HOME/.bun/bin/bun"',
  ].join(" && "))

  expect(result.stdout).toContain('export BUN_INSTALL="$HOME/.bun"')
  expect(result.stdout).toContain('export PATH="$BUN_INSTALL/bin:$PATH"')
})

test("compute_postgres_bin_exports emits Homebrew postgresql@16 bin path", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/install.sh",
    'compute_postgres_bin_exports "/opt/homebrew/opt/postgresql@16/bin"',
  ].join(" && "))

  expect(result.stdout).toContain('export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"')
})

test("compute_postgres_bin_exports omits exports for empty path", async () => {
  const result = await runShell([
    "source scripts/bootstrap/lib/common.sh",
    "source scripts/bootstrap/lib/install.sh",
    'compute_postgres_bin_exports ""',
  ].join(" && "))

  expect(result.exitCode).toBe(0)
  expect(result.stdout.trim()).toBe("")
})
