import { describe, expect, test } from "bun:test"
import { reconcilePostfillWarnings } from "./reconcilePostfillWarnings.ts"
import type { ShoesTransformWarning } from "./types.ts"

const warnings: ShoesTransformWarning[] = [
  {
    sourceId: "alpha-1",
    field: "D",
    kind: "manual_fill_product_description",
    message: "商品描述按当前规则留空",
  },
  {
    sourceId: "alpha-1",
    field: "G",
    kind: "manual_fill_key_information",
    message: "关键信息按当前规则留空",
  },
  {
    sourceId: "alpha-1",
    field: "J",
    kind: "manual_fill_logistics_template",
    message: "物流模板按当前规则留空",
  },
  {
    sourceId: "alpha-1",
    field: "T",
    kind: "manual_fill_seo_title",
    message: "SEO 标题按当前规则留空",
  },
  {
    sourceId: "alpha-1",
    field: "U",
    kind: "manual_fill_seo_description",
    message: "SEO 描述按当前规则留空",
  },
  {
    sourceId: "alpha-1",
    field: "E",
    kind: "missing_cover_image",
    message: "商品首图为空，需要人工补充",
  },
  {
    sourceId: "beta-2",
    field: "D",
    kind: "manual_fill_product_description",
    message: "商品描述按当前规则留空",
  },
  {
    sourceId: "beta-2",
    field: "G",
    kind: "manual_fill_key_information",
    message: "关键信息按当前规则留空",
  },
  {
    sourceId: "beta-2",
    field: "T",
    kind: "manual_fill_seo_title",
    message: "SEO 标题按当前规则留空",
  },
  {
    sourceId: "beta-2",
    field: "U",
    kind: "manual_fill_seo_description",
    message: "SEO 描述按当前规则留空",
  },
]

describe("reconcilePostfillWarnings", () => {
  test("returns the original warnings unchanged when postfill is skipped", () => {
    expect(reconcilePostfillWarnings({
      warnings,
      postfill: { status: "skipped" },
    })).toEqual(warnings)
  })

  test("returns the original warnings unchanged when postfill hard-stops", () => {
    expect(reconcilePostfillWarnings({
      warnings,
      postfill: {
        status: "error",
        error: "workbook is missing the 商品信息 sheet",
      },
    })).toEqual(warnings)
  })

  test("removes only successful D/G/T/U manual-fill warnings for updated products", () => {
    expect(reconcilePostfillWarnings({
      warnings,
      postfill: {
        status: "applied",
        productsAttempted: 2,
        productsUpdated: 1,
        updatedSourceIds: new Set(["alpha-1"]),
        warnings: [
          {
            sourceId: "beta-2",
            firstRowNumber: 6,
            reason: "row_not_found",
            message: "could not locate the product first row on 商品信息",
          },
        ],
      },
    })).toEqual([
      {
        sourceId: "alpha-1",
        field: "J",
        kind: "manual_fill_logistics_template",
        message: "物流模板按当前规则留空",
      },
      {
        sourceId: "alpha-1",
        field: "E",
        kind: "missing_cover_image",
        message: "商品首图为空，需要人工补充",
      },
      {
        sourceId: "beta-2",
        field: "D",
        kind: "manual_fill_product_description",
        message: "商品描述按当前规则留空",
      },
      {
        sourceId: "beta-2",
        field: "G",
        kind: "manual_fill_key_information",
        message: "关键信息按当前规则留空",
      },
      {
        sourceId: "beta-2",
        field: "T",
        kind: "manual_fill_seo_title",
        message: "SEO 标题按当前规则留空",
      },
      {
        sourceId: "beta-2",
        field: "U",
        kind: "manual_fill_seo_description",
        message: "SEO 描述按当前规则留空",
      },
    ])
  })
})
