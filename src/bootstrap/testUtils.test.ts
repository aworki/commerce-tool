import { expect, test } from "bun:test"
import { runShell } from "./testUtils"

test("runShell can source common bootstrap helpers", async () => {
  const result = await runShell("source scripts/bootstrap/lib/common.sh && have bash")
  expect(result.exitCode).toBe(0)
})
