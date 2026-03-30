import { describe, expect, mock, test } from "bun:test"
import { runAlbumIngestion } from "./runAlbumIngestion.ts"
import type { RawYupooAlbum } from "./types.ts"

const ALBUM_URL = "https://lol2021.x.yupoo.com/albums/230153753?uid=1&isSubCate=false"
const CATEGORY_URL = "https://lol2021.x.yupoo.com/categories/4372478"

const rawAlbum: RawYupooAlbum = {
  sourceUrl: ALBUM_URL,
  sourceSite: "yupoo",
  sourceType: "album",
  albumId: "230153753",
  rawTitle: "test title",
  rawDescription: "test description",
  sourceImageUrls: [
    "https://photo.yupoo.com/lol2021/a/raw-a.jpg",
    "https://photo.yupoo.com/lol2021/b/raw-b.jpg",
  ],
  logicalImageCount: 2,
}

describe("runAlbumIngestion", () => {
  test("returns error before persistence when OSS configuration is missing", async () => {
    const persistItem = mock(async () => {
      throw new Error("should not persist")
    })

    const result = await runAlbumIngestion(
      { mode: "album", url: ALBUM_URL },
      {
        extractAlbum: async () => rawAlbum,
        resolveCategoryContext: async () => ({ storageCategoryId: "uncategorized" }),
        materializeImages: async () => {
          throw new Error("missing OSS configuration: ALIYUN_OSS_BUCKET")
        },
        persistItem,
      },
    )

    expect(result.status).toBe("error")
    expect(result.error).toContain("ALIYUN_OSS_BUCKET")
    expect(persistItem).not.toHaveBeenCalled()
  })

  test("persists OSS URLs instead of source URLs", async () => {
    const persisted: string[][] = []

    const result = await runAlbumIngestion(
      { mode: "album", url: ALBUM_URL },
      {
        extractAlbum: async () => rawAlbum,
        resolveCategoryContext: async () => ({ storageCategoryId: "4372478" }),
        materializeImages: async () => [
          "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-cover.jpg",
          "https://cdn.example.com/catalog/yupoo/4372478/230153753/01-gallery.jpg",
        ],
        persistItem: async (item) => {
          persisted.push(item.images)
          return { action: "inserted", itemId: 1 }
        },
      },
    )

    expect(result.status).toBe("success")
    expect(persisted[0]).toEqual([
      "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-cover.jpg",
      "https://cdn.example.com/catalog/yupoo/4372478/230153753/01-gallery.jpg",
    ])
  })

  test("marks the album as updated when the final OSS image set changes", async () => {
    const persistItem = mock(async (item) => {
      if (item.images[1]?.includes("gallery-b")) {
        return { action: "updated" as const, itemId: 1 }
      }

      return { action: "inserted" as const, itemId: 1 }
    })

    await runAlbumIngestion(
      { mode: "album", url: ALBUM_URL },
      {
        extractAlbum: async () => rawAlbum,
        resolveCategoryContext: async () => ({ storageCategoryId: "4372478" }),
        materializeImages: async () => [
          "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-cover.jpg",
          "https://cdn.example.com/catalog/yupoo/4372478/230153753/01-gallery-a.jpg",
        ],
        persistItem,
      },
    )

    const changed = await runAlbumIngestion(
      { mode: "album", url: ALBUM_URL },
      {
        extractAlbum: async () => ({
          ...rawAlbum,
          sourceImageUrls: [
            "https://photo.yupoo.com/lol2021/a/raw-a.jpg",
            "https://photo.yupoo.com/lol2021/b/raw-b-2.jpg",
          ],
        }),
        resolveCategoryContext: async () => ({ storageCategoryId: "4372478" }),
        materializeImages: async () => [
          "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-cover.jpg",
          "https://cdn.example.com/catalog/yupoo/4372478/230153753/01-gallery-b.jpg",
        ],
        persistItem,
      },
    )

    expect(changed.updated).toBe(1)
  })

  test("standalone re-ingest reuses persisted category context", async () => {
    const ossImageUrls = ["https://img.example/4372478/230153753/00-cover.jpg"]

    const result = await runAlbumIngestion(
      { mode: "album", url: ALBUM_URL },
      {
        extractAlbum: async () => ({ ...rawAlbum, sourceImageUrls: [rawAlbum.sourceImageUrls[0]], logicalImageCount: 1 }),
        resolveCategoryContext: async () => ({
          categoryId: "4372478",
          categoryTitle: "【乔丹1代系列】",
          categoryUrl: CATEGORY_URL,
          storageCategoryId: "4372478",
        }),
        materializeImages: async ({ storageCategoryId, sourceImageUrls }) => {
          expect(storageCategoryId).toBe("4372478")
          expect(sourceImageUrls).toEqual([rawAlbum.sourceImageUrls[0]])
          return ossImageUrls
        },
        persistItem: async (item) => {
          expect(item.images).toEqual(ossImageUrls)
          expect(item.extra.category_id).toBe("4372478")
          expect(item.extra.category_title).toBe("【乔丹1代系列】")
          expect(item.extra.category_url).toBe(CATEGORY_URL)
          return { action: "skipped", itemId: 1 }
        },
      },
    )

    expect(result.status).toBe("success")
    expect(result.skipped).toBe(1)
  })
})
