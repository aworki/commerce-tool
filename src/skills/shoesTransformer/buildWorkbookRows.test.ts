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
    sizeValues: ["36", "36.5", "37.5"],
    tags: ["鞋类", "运动鞋", "低帮鞋"],
    warnings: [],
    ...overrides,
  }
}

describe("buildWorkbookRows", () => {
  test("maps explicit EUR sizes into full workbook spec values", () => {
    const rows = buildWorkbookRows(createNormalizedItem())

    expect(rows).toHaveLength(3)
    expect(rows[0].kind).toBe("first")
    expect(rows[0].cells.B).toContain("IQ7604-100")
    expect(rows[0].cells.E).toBe("cover")
    expect(rows[0].cells.F).toBe("gallery-1\ngallery-2")
    expect(rows[0].cells.L).toBeNull()
    expect(rows[0].cells.O).toBe("N")
    expect(rows[0].cells.X).toBe(["Size", "W US4=UK3.5=EUR36=CM23", "W US4.5=UK4=EUR36.5=CM23.5", "W US5=UK4.5=EUR37.5=CM23.5"].join("\n"))
    expect(rows[0].cells.AB).toBe("Size:W US4=UK3.5=EUR36=CM23")
    expect(rows[0].cells.AF).toBe(99)

    expect(rows[1].kind).toBe("continuation")
    expect(rows[1].cells.B).toBeUndefined()
    expect(rows[1].cells.X).toBeNull()
    expect(rows[1].cells.AB).toBe("Size:W US4.5=UK4=EUR36.5=CM23.5")
    expect(rows[1].cells.AF).toBe(99)
  })

  test("expands a supported EUR range into all workbook spec values", () => {
    const rows = buildWorkbookRows(createNormalizedItem({ sizeValues: ["36-47.5"] }))

    expect(rows).toHaveLength(17)
    expect(rows[0].cells.X).toBe([
      "Size",
      "W US4=UK3.5=EUR36=CM23",
      "W US4.5=UK4=EUR36.5=CM23.5",
      "W US5=UK4.5=EUR37.5=CM23.5",
      "W US5.5=UK5=EU38=CM24",
      "W US6=UK5.5=EU38.5=CM24",
      "W US6.5=UK6=EUR39=CM24.5",
      "M US7=UK6=EUR40=CM25",
      "M US7.5=UK6.5=EUR40.5=CM25.5",
      "M US8=UK7=EUR41=CM26",
      "M US8.5=UK7.5=EUR42=CM26.5",
      "M US9=UK8=EUR42.5=CM27",
      "M US9.5=UK8.5=EUR43=CM27.5",
      "M US10=UK9=EUR44=CM28",
      "M US10.5=UK9.5=EUR44.5=CM28.5",
      "M US11=UK10=EUR45=CM29",
      "M US12=UK11=EUR46=CM30",
      "M US13=UK12=EUR47.5=CM31",
    ].join("\n"))
    expect(rows[16].cells.AB).toBe("Size:M US13=UK12=EUR47.5=CM31")
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
