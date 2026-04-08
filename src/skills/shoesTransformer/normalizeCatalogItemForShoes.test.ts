import { describe, expect, test } from "bun:test"
import { cleanShoesTitle, normalizeCatalogItemForShoes } from "./normalizeCatalogItemForShoes.ts"
import type { CatalogItemRecord } from "../../db/catalogItems.ts"

function createCatalogItem(overrides: Partial<CatalogItemRecord> = {}): CatalogItemRecord {
  return {
    id: 1,
    sourceSite: "yupoo",
    sourceType: "album",
    sourceUrl: "https://lol2021.x.yupoo.com/albums/225167978",
    sourceId: "225167978",
    title: "【DA7OG】粉低勾 OG版乔丹1代低帮 IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
    description: "尺码#40-#48.5\n545026646\nUS7=UK6=EUR40=CM25\nUS7.5=UK6.5=EUR40.5=CM25.5\nKZ乔4",
    images: ["https://img.example/cover.jpg", "https://img.example/2.jpg"],
    extra: {},
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
    ...overrides,
  }
}

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
    expect(normalized.sizeValues).toEqual([
      "US7=UK6=EUR40=CM25",
      "US7.5=UK6.5=EUR40.5=CM25.5",
    ])
    expect(normalized.tags).toEqual(["鞋类", "运动鞋", "低帮鞋"])
    expect(normalized.warnings.find((warning) => warning.field === "D")?.kind).toBe("manual_fill_product_description")
    expect(normalized.warnings.find((warning) => warning.field === "G")?.kind).toBe("manual_fill_key_information")
    expect(normalized.warnings.find((warning) => warning.field === "J")?.kind).toBe("manual_fill_logistics_template")
    expect(normalized.warnings.find((warning) => warning.field === "T")?.kind).toBe("manual_fill_seo_title")
    expect(normalized.warnings.find((warning) => warning.field === "U")?.kind).toBe("manual_fill_seo_description")
    expect(normalized.warnings.find((warning) => warning.field === "AD")?.kind).toBe("manual_fill_sale_price")
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
      description: "",
      images: [],
    }), {
      tags: [],
    })

    expect(normalized.coverImageUrl).toBe("")
    expect(normalized.sizeValues).toEqual([])
    expect(normalized.warnings.find((warning) => warning.field === "E")?.kind).toBe("missing_cover_image")
    expect(normalized.warnings.some((warning) => warning.field === "L")).toBe(false)
    expect(normalized.warnings.find((warning) => warning.field === "X/AB")?.kind).toBe("missing_size_spec_and_sku")
  })
})
