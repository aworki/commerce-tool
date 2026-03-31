import { describe, expect, test } from "bun:test"
import { getDatabaseUrl } from "./client"

describe("getDatabaseUrl", () => {
  test("returns the explicit remote DATABASE_URL when provided", () => {
    expect(getDatabaseUrl({
      DATABASE_URL: "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=require",
    } as NodeJS.ProcessEnv)).toBe(
      "postgresql://app_user:secret@10.0.0.8:5432/gstack_web2skill?sslmode=require",
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
