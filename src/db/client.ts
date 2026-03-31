import { Pool } from "pg"

const DEFAULT_DATABASE_URL = "postgres://bytedance@localhost:5432/gstack_web2skill"

let pool: Pool | undefined

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const explicitDatabaseUrl = env.DATABASE_URL?.trim()
  if (explicitDatabaseUrl) return explicitDatabaseUrl

  if (env.GSTACK_REQUIRE_DATABASE_URL === "1") {
    throw new Error("DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1")
  }

  return DEFAULT_DATABASE_URL
}

export function getDb() {
  pool ??= new Pool({
    connectionString: getDatabaseUrl(),
  })

  return pool
}
