import { afterEach, describe, expect, test } from "bun:test"
import { resolveShoesTemplatePath } from "./runShoesTransform.ts"

describe("resolveShoesTemplatePath", () => {
  const originalTemplatePath = process.env.SHOES_TEMPLATE_PATH

  afterEach(() => {
    if (originalTemplatePath === undefined) {
      delete process.env.SHOES_TEMPLATE_PATH
      return
    }

    process.env.SHOES_TEMPLATE_PATH = originalTemplatePath
  })

  test("prefers an explicit template path when provided", () => {
    process.env.SHOES_TEMPLATE_PATH = "/tmp/from-env.xlsx"

    expect(resolveShoesTemplatePath("/tmp/from-arg.xlsx")).toBe("/tmp/from-arg.xlsx")
  })

  test("uses SHOES_TEMPLATE_PATH when no explicit template path is provided", () => {
    process.env.SHOES_TEMPLATE_PATH = "/tmp/from-env.xlsx"

    expect(resolveShoesTemplatePath()).toBe("/tmp/from-env.xlsx")
  })

  test("throws when no template path is available", () => {
    delete process.env.SHOES_TEMPLATE_PATH

    expect(() => resolveShoesTemplatePath()).toThrow("--template is required unless SHOES_TEMPLATE_PATH is set")
  })
})
