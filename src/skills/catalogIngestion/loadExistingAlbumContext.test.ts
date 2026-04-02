import { beforeEach, describe, expect, test } from "bun:test"
import { ensureCatalogSchema } from "../../db/schema.ts"
import { persistCatalogItem } from "./persistCatalogItem.ts"
import { resolveAlbumCategoryContext, loadExistingAlbumContext } from "./loadExistingAlbumContext.ts"

describe("loadExistingAlbumContext", () => {
  beforeEach(async () => {
    const db = await ensureCatalogSchema()
    await db.query("TRUNCATE TABLE catalog_items RESTART IDENTITY")
  })

  test("loads persisted category context from an existing album", async () => {
    await persistCatalogItem({
      sourceSite: "yupoo",
      sourceType: "album",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      sourceId: "230153753",
      title: "test",
      description: "test",
      images: ["https://cdn.example.com/a.jpg"],
      extra: {
        category_id: "4372478",
        category_title: "【乔丹1代系列】",
        category_url: "https://lol2021.x.yupoo.com/categories/4372478",
      },
    })

    await expect(loadExistingAlbumContext("230153753")).resolves.toEqual({
      categoryId: "4372478",
      categoryTitle: "【乔丹1代系列】",
      categoryUrl: "https://lol2021.x.yupoo.com/categories/4372478",
    })
  })
})

describe("resolveAlbumCategoryContext", () => {
  test("prefers current category context over persisted context", async () => {
    const resolved = await resolveAlbumCategoryContext({
      albumId: "230153753",
      inputCategoryContext: {
        categoryId: "4372478",
        categoryTitle: "【乔丹1代系列】",
        categoryUrl: "https://lol2021.x.yupoo.com/categories/4372478",
      },
      loadExisting: async () => ({
        categoryId: "old",
        categoryTitle: "old",
        categoryUrl: "old",
      }),
    })

    expect(resolved.categoryId).toBe("4372478")
    expect(resolved.storageCategoryId).toBe("4372478")
  })

  test("reuses persisted category context for standalone re-ingest", async () => {
    const resolved = await resolveAlbumCategoryContext({
      albumId: "230153753",
      inputCategoryContext: undefined,
      loadExisting: async () => ({
        categoryId: "4372478",
        categoryTitle: "【乔丹1代系列】",
        categoryUrl: "https://lol2021.x.yupoo.com/categories/4372478",
      }),
    })

    expect(resolved.categoryId).toBe("4372478")
    expect(resolved.storageCategoryId).toBe("4372478")
  })

  test("falls back to uncategorized when no category context exists", async () => {
    const resolved = await resolveAlbumCategoryContext({
      albumId: "230153753",
      inputCategoryContext: undefined,
      loadExisting: async () => undefined,
    })

    expect(resolved.categoryId).toBeUndefined()
    expect(resolved.storageCategoryId).toBe("uncategorized")
  })
})
