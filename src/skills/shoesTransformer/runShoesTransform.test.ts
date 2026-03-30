import { afterEach, describe, expect, test } from "bun:test"
import {
  resolveShoesTemplatePath,
  runShoesTransformExecution,
  toShoesTransformResult,
} from "./runShoesTransform.ts"
import type { CatalogItemRecord } from "../../db/catalogItems.ts"
import type { ShoesWorkbookRow } from "./types.ts"

function createCatalogItem(overrides: Partial<CatalogItemRecord> = {}): CatalogItemRecord {
  return {
    id: 1,
    sourceSite: "yupoo",
    sourceType: "album",
    sourceUrl: "https://lol2021.x.yupoo.com/albums/225167978",
    sourceId: "225167978",
    title: "【DA7OG】粉低勾 OG版乔丹1代低帮 IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
    description: "尺码#36-#37 545126646 OG乔1",
    images: ["https://img.example/cover.jpg", "https://img.example/2.jpg"],
    extra: {},
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
    ...overrides,
  }
}

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

describe("runShoesTransformExecution", () => {
  test("returns a deterministic manifest with each product's first workbook row", async () => {
    const writtenRows: ShoesWorkbookRow[][] = []

    const result = await runShoesTransformExecution(
      {
        outputPath: "/tmp/shoes-output.xlsx",
        templatePath: "/tmp/shoes-template.xlsx",
        tags: [" 鞋类 ", "低帮鞋"],
      },
      {
        loadCatalogItems: async () => [
          createCatalogItem({
            sourceId: "alpha-1",
            title: "【AA1KF】复刻公牛 本地版乔丹4代篮SB联名球鞋 FV5029-006 Air Jordan 4 \"Bred Reimagined\"",
            description: "没有尺码信息",
            images: ["https://img.example/alpha-cover.jpg"],
          }),
          createCatalogItem({
            id: 2,
            sourceId: "beta-2",
            title: "【CA0XH】复刻愤怒的公牛 头层皮乔丹4代篮球鞋 FQ8138-600 Air Jordan 4 Retro 'Toro Bravo' 2026",
            description: "尺码 40/40.5/41",
            images: ["https://img.example/beta-cover.jpg", "https://img.example/beta-gallery.jpg"],
          }),
        ],
        writeShoesWorkbook: async ({ rows }) => {
          writtenRows.push(rows)
        },
      },
    )

    expect(result.status).toBe("success")
    expect(result.outputPath).toBe("/tmp/shoes-output.xlsx")
    expect(result.exportedItems).toBe(2)
    expect(result.exportedRows).toBe(4)
    expect(result.manifest).toEqual([
      {
        sourceId: "alpha-1",
        title: 'FV5029-006 Air Jordan 4 "Bred Reimagined"',
        firstRowNumber: 5,
      },
      {
        sourceId: "beta-2",
        title: "FQ8138-600 Air Jordan 4 Retro 'Toro Bravo' 2026",
        firstRowNumber: 6,
      },
    ])
    expect(writtenRows).toHaveLength(1)
    expect(writtenRows[0]).toHaveLength(4)
  })
})

describe("toShoesTransformResult", () => {
  test("drops the internal manifest from the public transform result", () => {
    expect(toShoesTransformResult({
      status: "success",
      outputPath: "/tmp/shoes-output.xlsx",
      exportedItems: 2,
      exportedRows: 4,
      warnings: [
        {
          sourceId: "alpha-1",
          field: "D",
          kind: "manual_fill_product_description",
          message: "商品描述按当前规则留空",
        },
      ],
      manifest: [
        {
          sourceId: "alpha-1",
          title: "Alpha 1",
          firstRowNumber: 5,
        },
      ],
    })).toEqual({
      status: "success",
      outputPath: "/tmp/shoes-output.xlsx",
      exportedItems: 2,
      exportedRows: 4,
      warnings: [
        {
          sourceId: "alpha-1",
          field: "D",
          kind: "manual_fill_product_description",
          message: "商品描述按当前规则留空",
        },
      ],
    })
  })
})
