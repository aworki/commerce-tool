import { spawn } from "bun"

export async function runShell(script: string, env: Record<string, string> = {}) {
  const proc = spawn(["bash", "-lc", script], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })

  return {
    exitCode: await proc.exited,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  }
}
