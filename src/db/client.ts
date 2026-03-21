import { Pool } from "pg"

const DEFAULT_DATABASE_URL = "postgres://bytedance@localhost:5432/gstack_web2skill"

let pool: Pool | undefined

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
}

export function getDb() {
  pool ??= new Pool({
    connectionString: getDatabaseUrl(),
  })

  return pool
}
