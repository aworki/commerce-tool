import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "bun:test"

const projectRoot = resolve(import.meta.dir, "../..")
const removedScriptName = "migrate:sql" + "ite-to-pg"
const removedCliPath = resolve(projectRoot, "src/cli/migrateSqli" + "teToPostgres.ts")
const localClaudeSettingsPath = resolve(projectRoot, ".claude/settings.local.json")

describe("database cleanup", () => {
  test("does not keep the old migration entrypoints", () => {
    expect(existsSync(removedCliPath)).toBe(false)

    const packageJson = readFileSync(resolve(projectRoot, "package.json"), "utf8")
    expect(packageJson.includes(removedScriptName)).toBe(false)

    if (existsSync(localClaudeSettingsPath)) {
      const localSettings = readFileSync(localClaudeSettingsPath, "utf8")
      expect(localSettings.includes(removedScriptName)).toBe(false)
    }
  })
})
