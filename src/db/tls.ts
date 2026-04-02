import { readFileSync } from "node:fs"

type ReadCaFile = (path: string) => string

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

function normalizeDatabaseHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname
}

export function isRemoteDatabaseUrl(databaseUrl: string): boolean {
  return !LOCAL_DATABASE_HOSTS.has(normalizeDatabaseHostname(new URL(databaseUrl).hostname))
}

export function getRequiredDatabaseCaCertPath(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_SSL_CA_CERT_PATH?.trim()
  if (!value) {
    throw new Error("DATABASE_SSL_CA_CERT_PATH is required for remote PostgreSQL TLS")
  }

  return value
}

export function buildDatabaseSslConfig(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  readCaFile: ReadCaFile = (path) => readFileSync(path, "utf8"),
) {
  if (!isRemoteDatabaseUrl(databaseUrl)) return undefined

  return {
    ca: readCaFile(getRequiredDatabaseCaCertPath(env)),
    rejectUnauthorized: true as const,
  }
}
