import { describe, expect, test } from "bun:test"
import { cleanShoesTitle, normalizeCatalogItemForShoes, parseSizeValuesFromDescription } from "./normalizeCatalogItemForShoes.ts"
import type { CatalogItemRecord } from "../../db/catalogItems.ts"

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

describe("parseSizeValuesFromDescription", () => {
  test("keeps a range exactly as written instead of expanding it", () => {
    expect(parseSizeValuesFromDescription("尺码#36-#37 545126646 OG乔1")).toEqual(["36-37"])
  })

  test("splits explicit size lists without further processing", () => {
    expect(parseSizeValuesFromDescription("尺码 40/40.5/41/41")).toEqual(["40", "40.5", "41", "41"])
  })
})

describe("normalizeCatalogItemForShoes", () => {
  test("keeps only the content after the last Chinese character in mixed-language titles", () => {
    expect(cleanShoesTitle("【AA1KF】复刻公牛 本地版乔丹4代篮SB联名球鞋 FV5029-006 Air Jordan 4 \"Bred Reimagined\"")).toBe(
      "FV5029-006 Air Jordan 4 \"Bred Reimagined\"",
    )
    expect(cleanShoesTitle("【CA0XH】复刻愤怒的公牛 头层皮乔丹4代篮球鞋 FQ8138-600 Air Jordan 4 Retro 'Toro Bravo' 2026")).toBe(
      "FQ8138-600 Air Jordan 4 Retro 'Toro Bravo' 2026",
    )
  })

  test("keeps the original title when no Chinese character exists", () => {
    expect(cleanShoesTitle("【DA7OG】IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'")).toBe(
      "【DA7OG】IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
    )
  })

  test("builds export-ready defaults from a catalog item", () => {
    const normalized = normalizeCatalogItemForShoes(createCatalogItem(), {
      tags: ["鞋类", "运动鞋", "低帮鞋"],
    })

    expect(normalized.cleanTitle).toBe("IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'")
    expect(normalized.cleanTitle.startsWith("【")).toBe(false)
    expect(normalized.cleanTitle).toContain("IQ7604-100")
    expect(normalized.cleanTitle).toContain("'Muslin Pink'")
    expect(normalized.cleanTitle.includes(" OG IQ7604-100")).toBe(false)
    expect(normalized.coverImageUrl).toBe("https://img.example/cover.jpg")
    expect(normalized.galleryImageUrls).toEqual(["https://img.example/2.jpg"])
    expect(normalized.sizeValues).toEqual(["36-37"])
    expect(normalized.tags).toEqual(["鞋类", "运动鞋", "低帮鞋"])
    expect(normalized.warnings.some((warning) => warning.field === "J")).toBe(true)
    expect(normalized.warnings.some((warning) => warning.field === "AD")).toBe(true)
    expect(normalized.warnings.some((warning) => warning.field === "L")).toBe(false)
    expect(normalized.warnings.some((warning) => warning.field === "X/AB")).toBe(false)
  })

  test("does not warn when tags are omitted because tag export is intentionally blank", () => {
    const normalized = normalizeCatalogItemForShoes(createCatalogItem(), {
      tags: [],
    })

    expect(normalized.tags).toEqual([])
    expect(normalized.warnings.some((warning) => warning.field === "L")).toBe(false)
    expect(normalized.warnings.some((warning) => warning.field === "X/AB")).toBe(false)
  })

  test("warns when required manual fields cannot be inferred", () => {
    const normalized = normalizeCatalogItemForShoes(createCatalogItem({
      description: "没有尺码信息",
      images: [],
    }), {
      tags: [],
    })

    expect(normalized.coverImageUrl).toBe("")
    expect(normalized.sizeValues).toEqual([])
    expect(normalized.warnings.some((warning) => warning.field === "E")).toBe(true)
    expect(normalized.warnings.some((warning) => warning.field === "L")).toBe(false)
    expect(normalized.warnings.some((warning) => warning.field === "X/AB")).toBe(true)
  })
})
