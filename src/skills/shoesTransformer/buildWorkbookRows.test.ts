import { describe, expect, test } from "bun:test"
import { buildWorkbookRows } from "./buildWorkbookRows.ts"
import type { ShoesNormalizedItem } from "./types.ts"
import type { CatalogItemRecord } from "../../db/catalogItems.ts"

const baseItem: CatalogItemRecord = {
  id: 1,
  sourceSite: "yupoo",
  sourceType: "album",
  sourceUrl: "https://lol2021.x.yupoo.com/albums/225167978",
  sourceId: "225167978",
  title: "raw",
  description: "desc",
  images: ["cover", "gallery-1", "gallery-2"],
  extra: {},
  createdAt: "2026-03-27T00:00:00.000Z",
  updatedAt: "2026-03-27T00:00:00.000Z",
}

function createNormalizedItem(overrides: Partial<ShoesNormalizedItem> = {}): ShoesNormalizedItem {
  return {
    item: baseItem,
    cleanTitle: "【DA7OG】 IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
    coverImageUrl: "cover",
    galleryImageUrls: ["gallery-1", "gallery-2"],
    sizeValues: ["US7=UK6=EUR40=CM25", "US7.5=UK6.5=EUR40.5=CM25.5", "US8/UK7/EUR41/CM26"],
    tags: ["鞋类", "运动鞋", "低帮鞋"],
    warnings: [],
    ...overrides,
  }
}

describe("buildWorkbookRows", () => {
  test("uses description lines directly as workbook spec values", () => {
    const rows = buildWorkbookRows(createNormalizedItem())

    expect(rows).toHaveLength(3)
    expect(rows[0].kind).toBe("first")
    expect(rows[0].cells.B).toContain("IQ7604-100")
    expect(rows[0].cells.E).toBe("cover")
    expect(rows[0].cells.F).toBe("gallery-1\ngallery-2")
    expect(rows[0].cells.L).toBeNull()
    expect(rows[0].cells.O).toBe("N")
    expect(rows[0].cells.X).toBe(["Size", "US7=UK6=EUR40=CM25", "US7.5=UK6.5=EUR40.5=CM25.5", "US8/UK7/EUR41/CM26"].join("\n"))
    expect(rows[0].cells.AB).toBe("Size:US7=UK6=EUR40=CM25")
    expect(rows[0].cells.AD).toBeNull()
    expect(rows[0].cells.AF).toBeNull()

    expect(rows[1].kind).toBe("continuation")
    expect(rows[1].cells.B).toBeUndefined()
    expect(rows[1].cells.X).toBeNull()
    expect(rows[1].cells.AB).toBe("Size:US7.5=UK6.5=EUR40.5=CM25.5")
    expect(rows[1].cells.AD).toBeNull()
    expect(rows[1].cells.AF).toBeNull()
  })

  test("does not expand or remap description lines", () => {
    const rows = buildWorkbookRows(createNormalizedItem({ sizeValues: ["US13=UK12=EUR47.5=CM31", "US14/UK13/EUR48.5/CM32"] }))

    expect(rows).toHaveLength(2)
    expect(rows[0].cells.X).toBe([
      "Size",
      "US13=UK12=EUR47.5=CM31",
      "US14/UK13/EUR48.5/CM32",
    ].join("\n"))
    expect(rows[1].cells.AB).toBe("Size:US14/UK13/EUR48.5/CM32")
  })

  test("keeps a single shared row when no sizes are available", () => {
    const rows = buildWorkbookRows(createNormalizedItem({ sizeValues: [] }))

    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("first")
    expect(rows[0].cells.B).toContain("IQ7604-100")
    expect(rows[0].cells.X).toBeUndefined()
    expect(rows[0].cells.AB).toBeUndefined()
  })
})
