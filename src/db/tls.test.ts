import { describe, expect, test } from "bun:test"
import { buildDatabaseSslConfig, isRemoteDatabaseUrl } from "./tls"

describe("isRemoteDatabaseUrl", () => {
  test("returns false for localhost urls", () => {
    expect(isRemoteDatabaseUrl("postgres://bytedance@localhost:5432/gstack_web2skill")).toBe(false)
  })

  test("returns false for 127.0.0.1 urls", () => {
    expect(isRemoteDatabaseUrl("postgres://bytedance@127.0.0.1:5432/gstack_web2skill")).toBe(false)
  })

  test("returns false for IPv6 loopback urls", () => {
    expect(isRemoteDatabaseUrl("postgres://bytedance@[::1]:5432/gstack_web2skill")).toBe(false)
  })

  test("returns true for remote network urls", () => {
    expect(isRemoteDatabaseUrl("postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full")).toBe(true)
  })
})

describe("buildDatabaseSslConfig", () => {
  test("returns undefined for localhost connections", () => {
    expect(buildDatabaseSslConfig("postgres://bytedance@localhost:5432/gstack_web2skill")).toBeUndefined()
  })

  test("returns undefined for IPv6 loopback connections", () => {
    expect(buildDatabaseSslConfig("postgres://bytedance@[::1]:5432/gstack_web2skill")).toBeUndefined()
  })

  test("trims DATABASE_SSL_CA_CERT_PATH before reading the CA file", () => {
    expect(buildDatabaseSslConfig(
      "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      { DATABASE_SSL_CA_CERT_PATH: "  /tmp/gstack-pg-tls/internal-ca.pem  " } as NodeJS.ProcessEnv,
      (path) => {
        expect(path).toBe("/tmp/gstack-pg-tls/internal-ca.pem")
        return "CA_TEXT"
      },
    )).toEqual({
      ca: "CA_TEXT",
      rejectUnauthorized: true,
    })
  })


  test("throws when a remote database url is missing DATABASE_SSL_CA_CERT_PATH", () => {
    expect(() => buildDatabaseSslConfig(
      "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      {} as NodeJS.ProcessEnv,
      () => "unused",
    )).toThrow("DATABASE_SSL_CA_CERT_PATH is required for remote PostgreSQL TLS")
  })

  test("loads CA text and enables strict verification for remote urls", () => {
    expect(buildDatabaseSslConfig(
      "postgresql://app_user:secret@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full",
      { DATABASE_SSL_CA_CERT_PATH: "/tmp/gstack-pg-tls/internal-ca.pem" } as NodeJS.ProcessEnv,
      (path) => {
        expect(path).toBe("/tmp/gstack-pg-tls/internal-ca.pem")
        return "CA_TEXT"
      },
    )).toEqual({
      ca: "CA_TEXT",
      rejectUnauthorized: true,
    })
  })
})
