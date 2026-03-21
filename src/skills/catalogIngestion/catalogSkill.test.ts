import { describe, expect, test } from "bun:test"
import { createCatalogIngestionSkill } from "./catalogSkill.ts"

const ALBUM_URL = "https://lol2021.x.yupoo.com/albums/225167978?uid=1&isSubCate=false"
const CATEGORY_URL = "https://lol2021.x.yupoo.com/categories/4372478"

describe("catalog ingestion skill", () => {
  test("exposes one skill that accepts album and category URLs only", async () => {
    const skill = createCatalogIngestionSkill({
      runAlbum: async (input) => ({
        status: "success",
        sourceType: "album",
        sourceUrl: input.url,
        inserted: 1,
        updated: 0,
        skipped: 0,
      }),
      runCategory: async (input) => ({
        status: "success",
        sourceType: "category",
        sourceUrl: input.url,
        estimatedTotalAlbums: 689,
        plannedPages: 1,
        processedAlbums: 50,
        inserted: 50,
        updated: 0,
        skipped: 0,
        failed: 0,
        albumResults: [],
      }),
    })

    expect(skill.name).toBe("catalog-ingestion")
    expect(skill.description).toContain("Yupoo")

    const albumResult = await skill.execute({ url: ALBUM_URL })
    expect(albumResult.sourceType).toBe("album")
    expect(albumResult.status).toBe("success")

    const categoryResult = await skill.execute({ url: CATEGORY_URL, limit: 50 })
    expect(categoryResult.sourceType).toBe("category")
    expect(categoryResult.status).toBe("success")
  })

  test("rejects unsupported input that is neither album nor category", async () => {
    const skill = createCatalogIngestionSkill({
      runAlbum: async () => {
        throw new Error("should not run")
      },
      runCategory: async () => {
        throw new Error("should not run")
      },
    })

    const result = await skill.execute({ url: "https://example.com/not-yupoo" })

    expect(result.status).toBe("error")
    expect(result.error).toContain("unsupported")
  })
})
