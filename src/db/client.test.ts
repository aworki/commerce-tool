import { describe, expect, test } from "bun:test"
import { Client } from "pg"
import { buildDatabasePoolConfig, getDatabaseUrl } from "./client"

describe("getDatabaseUrl", () => {
  test("returns the explicit remote DATABASE_URL when provided", () => {
    expect(getDatabaseUrl({
      DATABASE_URL: "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
    } as NodeJS.ProcessEnv)).toBe(
      "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
    )
  })

  test("throws when deployment mode requires DATABASE_URL but it is missing", () => {
    expect(() => getDatabaseUrl({ GSTACK_REQUIRE_DATABASE_URL: "1" } as NodeJS.ProcessEnv)).toThrow(
      "DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1",
    )
  })

  test("throws when deployment mode requires DATABASE_URL but it is blank", () => {
    expect(() => getDatabaseUrl({
      GSTACK_REQUIRE_DATABASE_URL: "1",
      DATABASE_URL: "   ",
    } as NodeJS.ProcessEnv)).toThrow(
      "DATABASE_URL is required when GSTACK_REQUIRE_DATABASE_URL=1",
    )
  })

  test("keeps the current localhost fallback for non-deployment environments", () => {
    expect(getDatabaseUrl({} as NodeJS.ProcessEnv)).toBe(
      "postgres://bytedance@localhost:5432/gstack_web2skill",
    )
  })
})

describe("buildDatabasePoolConfig", () => {
  test("preserves the CA-backed TLS settings when pg parses the config", () => {
    const client = new Client(buildDatabasePoolConfig({
      DATABASE_URL: "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      DATABASE_SSL_CA_CERT_PATH: "/tmp/gstack-pg-tls/internal-ca.pem",
    } as NodeJS.ProcessEnv, (path) => {
      expect(path).toBe("/tmp/gstack-pg-tls/internal-ca.pem")
      return "CA_TEXT"
    }))

    expect(client.connectionParameters.ssl).toEqual({
      ca: "CA_TEXT",
      rejectUnauthorized: true,
    })
  })

  test("adds strict TLS config for remote DATABASE_URL values", () => {
    expect(buildDatabasePoolConfig({
      DATABASE_URL: "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      DATABASE_SSL_CA_CERT_PATH: "/tmp/gstack-pg-tls/internal-ca.pem",
    } as NodeJS.ProcessEnv, (path) => {
      expect(path).toBe("/tmp/gstack-pg-tls/internal-ca.pem")
      return "CA_TEXT"
    })).toEqual({
      connectionString: "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill",
      ssl: {
        ca: "CA_TEXT",
        rejectUnauthorized: true,
      },
    })
  })

  test("keeps local fallback connections non-TLS-configured", () => {
    expect(buildDatabasePoolConfig({} as NodeJS.ProcessEnv, () => {
      throw new Error("should not read a CA file for localhost")
    })).toEqual({
      connectionString: "postgres://bytedance@localhost:5432/gstack_web2skill",
    })
  })
})
