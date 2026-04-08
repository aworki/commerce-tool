import { afterEach, describe, expect, mock, test } from "bun:test"
import {
  resolveShoesTemplatePath,
  runShoesTransformExecution,
  toShoesTransformResult,
} from "./runShoesTransform.ts"
import type { CatalogItemRecord } from "../../db/catalogItems.ts"
import type { ShoesWorkbookRow } from "./types.ts"

const VALID_OSS_PUBLIC_BASE_URL = "https://cdn.example.com"

function createCatalogItem(overrides: Partial<CatalogItemRecord> = {}): CatalogItemRecord {
  return {
    id: 1,
    sourceSite: "yupoo",
    sourceType: "album",
    sourceUrl: "https://lol2021.x.yupoo.com/albums/225167978",
    sourceId: "225167978",
    title: "【DA7OG】粉低勾 OG版乔丹1代低帮 IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
    description: "US7=UK6=EUR40=CM25\nUS7.5=UK6.5=EUR40.5=CM25.5\nUS8=UK7=EUR41=CM26",
    images: [
      `${VALID_OSS_PUBLIC_BASE_URL}/catalog/yupoo/4372478/225167978/00-cover.jpg`,
      `${VALID_OSS_PUBLIC_BASE_URL}/catalog/yupoo/4372478/225167978/01-gallery.jpg`,
    ],
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
  const originalOssBaseUrl = process.env.ALIYUN_OSS_PUBLIC_BASE_URL

  afterEach(() => {
    if (originalOssBaseUrl === undefined) {
      delete process.env.ALIYUN_OSS_PUBLIC_BASE_URL
      return
    }

    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = originalOssBaseUrl
  })

  test("returns a deterministic manifest with each product's first workbook row", async () => {
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = VALID_OSS_PUBLIC_BASE_URL

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
            images: [`${VALID_OSS_PUBLIC_BASE_URL}/catalog/yupoo/alpha/alpha-1/00-cover.jpg`],
          }),
          createCatalogItem({
            id: 2,
            sourceId: "beta-2",
            title: "【CA0XH】复刻愤怒的公牛 头层皮乔丹4代篮球鞋 FQ8138-600 Air Jordan 4 Retro 'Toro Bravo' 2026",
            description: "US7=UK6=EUR40=CM25\nUS7.5=UK6.5=EUR40.5=CM25.5\nUS8=UK7=EUR41=CM26",
            images: [
              `${VALID_OSS_PUBLIC_BASE_URL}/catalog/yupoo/beta/beta-2/00-cover.jpg`,
              `${VALID_OSS_PUBLIC_BASE_URL}/catalog/yupoo/beta/beta-2/01-gallery.jpg`,
            ],
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

  test("fails before writing when a catalog item still has legacy non-OSS image urls", async () => {
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = VALID_OSS_PUBLIC_BASE_URL
    const writeShoesWorkbook = mock(async () => undefined)

    const result = await runShoesTransformExecution(
      {
        outputPath: "/tmp/shoes-output.xlsx",
        templatePath: "/tmp/shoes-template.xlsx",
      },
      {
        loadCatalogItems: async () => [
          createCatalogItem({
            sourceId: "legacy-1",
            images: ["https://photo.yupoo.com/lol2021/legacy/raw-a.jpg"],
          }),
        ],
        writeShoesWorkbook,
      },
    )

    expect(result.status).toBe("error")
    expect(result.error).toContain("legacy-1")
    expect(result.error).toContain("canonical OSS image URLs")
    expect(writeShoesWorkbook).not.toHaveBeenCalled()
  })

  test("allows empty image lists to continue through the existing warning path", async () => {
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = VALID_OSS_PUBLIC_BASE_URL
    const writeShoesWorkbook = mock(async () => undefined)

    const result = await runShoesTransformExecution(
      {
        outputPath: "/tmp/shoes-output.xlsx",
        templatePath: "/tmp/shoes-template.xlsx",
      },
      {
        loadCatalogItems: async () => [
          createCatalogItem({
            sourceId: "missing-cover-1",
            images: [],
          }),
        ],
        writeShoesWorkbook,
      },
    )

    expect(result.status).toBe("success")
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "missing-cover-1",
        kind: "missing_cover_image",
      }),
    ]))
    expect(writeShoesWorkbook).toHaveBeenCalledTimes(1)
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
