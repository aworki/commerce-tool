import { Pool } from "pg"
import { buildDatabaseSslConfig } from "./tls"

const DEFAULT_DATABASE_URL = "postgres://bytedance@localhost:5432/gstack_web2skill"
const PG_SSL_CONNECTION_PARAMETERS = ["sslmode", "sslrootcert", "sslcert", "sslkey"]

let pool: Pool | undefined

function stripPgSslConnectionParameters(connectionString: string) {
  const url = new URL(connectionString)

  for (const key of PG_SSL_CONNECTION_PARAMETERS) {
    url.searchParams.delete(key)
  }

  return url.toString()
}

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const explicitDatabaseUrl = env.DATABASE_URL?.trim()
  if (explicitDatabaseUrl) return explicitDatabaseUrl

  if (env.GSTACK_REQUIRE_DATABASE_URL === "1") {
    throw new Error("DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1")
  }

  return DEFAULT_DATABASE_URL
}

export function buildDatabasePoolConfig(
  env: NodeJS.ProcessEnv = process.env,
  readCaFile?: (path: string) => string,
) {
  const databaseUrl = getDatabaseUrl(env)
  const ssl = buildDatabaseSslConfig(databaseUrl, env, readCaFile)
  const connectionString = ssl ? stripPgSslConnectionParameters(databaseUrl) : databaseUrl

  return ssl ? { connectionString, ssl } : { connectionString }
}

export function getDb() {
  pool ??= new Pool(buildDatabasePoolConfig())

  return pool
}
