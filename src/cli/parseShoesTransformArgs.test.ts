import { describe, expect, test } from "bun:test"
import { parseShoesTransformArgs } from "./parseShoesTransformArgs.ts"

describe("parseShoesTransformArgs", () => {
  test("accepts category selectors for batch exports", () => {
    const input = parseShoesTransformArgs([
      "--category-url",
      "https://lol2021.x.yupoo.com/categories/5140640",
      "--category-id",
      "5140640",
      "--output",
      "/tmp/march.xlsx",
    ])

    expect(input.categoryUrls).toEqual(["https://lol2021.x.yupoo.com/categories/5140640"])
    expect(input.categoryIds).toEqual(["5140640"])
    expect(input.outputPath).toBe("/tmp/march.xlsx")
  })
})
