import { beforeEach, describe, expect, test } from "bun:test"
import { listCatalogItems } from "../../db/catalogItems.ts"
import { ensureCatalogSchema } from "../../db/schema.ts"
import { parseYupooAlbumHtml } from "./extractYupooAlbum.ts"
import { normalizeYupooAlbum } from "./normalizeYupooAlbum.ts"
import { resolveAlbumCategoryContext } from "./loadExistingAlbumContext.ts"
import { persistCatalogItem } from "./persistCatalogItem.ts"
import { runAlbumIngestion } from "./runAlbumIngestion.ts"

const SAMPLE_URL = "https://lol2021.x.yupoo.com/albums/225167978?uid=1&isSubCate=false"

const SAMPLE_HTML = `
<!doctype html>
<html>
  <head>
    <title>【DA7OG】粉低勾 OG版乔丹1代低帮 | 相册 | 九龙鞋业</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ImageGallery",
        "name": "【DA7OG】粉低勾 OG版乔丹1代低帮 IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
        "description": "US7=UK6=EUR40=CM25\\nUS7.5=UK6.5=EUR40.5=CM25.5\\nUS8=UK7=EUR41=CM26",
        "url": "https://lol2021.x.yupoo.com/albums/225167978",
        "datePublished": "2026-02-06",
        "dateModified": "2026-02-09"
      }
    </script>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "九龙鞋业"
      }
    </script>
    <script>
      window.OWNER = 'lol2021'
    </script>
  </head>
  <body>
    <h1>【DA7OG】粉低勾 OG版乔丹1代低帮 IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'</h1>
    <div class="showalbumheader__main">
      <img src="https://photo.yupoo.com/lol2021/cover-group/big.jpg">
    </div>
    <div class="showalbum__parent">
      <img
        data-origin-src="https://photo.yupoo.com/lol2021/gallery-a/raw-a.jpg"
        data-src="https://photo.yupoo.com/lol2021/gallery-a/big.jpg"
        src="https://photo.yupoo.com/lol2021/gallery-a/small.jpg"
      >
    </div>
  </body>
</html>
`

describe("catalog ingestion", () => {
  beforeEach(async () => {
    const db = await ensureCatalogSchema()

    await db.query("TRUNCATE TABLE catalog_items RESTART IDENTITY")
  })

  test("parses yupoo album HTML into raw album data", () => {
    const raw = parseYupooAlbumHtml(SAMPLE_HTML, SAMPLE_URL)

    expect(raw.albumId).toBe("225167978")
    expect(raw.shopName).toBe("九龙鞋业")
    expect(raw.owner).toBe("lol2021")
    expect(raw.sourceImageUrls).toEqual([
      "https://photo.yupoo.com/lol2021/cover-group/big.jpg",
      "https://photo.yupoo.com/lol2021/gallery-a/raw-a.jpg",
    ])
    expect(raw.logicalImageCount).toBe(2)
    expect(raw.rawTitle).toContain("Travis Scott")
    expect(raw.rawDescription).toBe("US7=UK6=EUR40=CM25\nUS7.5=UK6.5=EUR40.5=CM25.5\nUS8=UK7=EUR41=CM26")
  })

  test("normalizes and persists an album item idempotently", async () => {
    const raw = parseYupooAlbumHtml(SAMPLE_HTML, SAMPLE_URL)
    const item = normalizeYupooAlbum(raw, raw.sourceImageUrls, { storageCategoryId: "uncategorized" })

    const first = await persistCatalogItem(item)
    const second = await persistCatalogItem(item)

    expect(first.action).toBe("inserted")
    expect(second.action).toBe("skipped")
    expect(item.sourceId).toBe("225167978")
    expect(item.description).toBe("US7=UK6=EUR40=CM25\nUS7.5=UK6.5=EUR40.5=CM25.5\nUS8=UK7=EUR41=CM26")
    expect(item.images.length).toBe(2)
    expect(item.extra.album_id).toBe("225167978")
  })

  test("stores category metadata when an album is crawled through a category workflow", () => {
    const raw = parseYupooAlbumHtml(SAMPLE_HTML, SAMPLE_URL)
    const item = normalizeYupooAlbum(raw, raw.sourceImageUrls, {
      categoryId: "5140640",
      categoryTitle: "【3月份新品】",
      categoryUrl: "https://lol2021.x.yupoo.com/categories/5140640",
      storageCategoryId: "5140640",
    })

    expect(item.extra.category_id).toBe("5140640")
    expect(item.extra.category_title).toBe("【3月份新品】")
    expect(item.extra.category_url).toBe("https://lol2021.x.yupoo.com/categories/5140640")
  })

  test("persists OSS urls into images_json", async () => {
    const raw = parseYupooAlbumHtml(SAMPLE_HTML, SAMPLE_URL)

    const result = await runAlbumIngestion(
      { mode: "album", url: SAMPLE_URL },
      {
        extractAlbum: async () => raw,
        resolveCategoryContext: async () => ({
          categoryId: "4372478",
          categoryTitle: "【乔丹1代系列】",
          categoryUrl: "https://lol2021.x.yupoo.com/categories/4372478",
          storageCategoryId: "4372478",
        }),
        materializeImages: async () => [
          "https://cdn.example.com/catalog/yupoo/4372478/225167978/00-cover.jpg",
          "https://cdn.example.com/catalog/yupoo/4372478/225167978/01-gallery.jpg",
        ],
        persistItem: persistCatalogItem,
      },
    )

    const records = await listCatalogItems({ sourceIds: ["225167978"] })

    expect(result.status).toBe("success")
    expect(records[0].images).toEqual([
      "https://cdn.example.com/catalog/yupoo/4372478/225167978/00-cover.jpg",
      "https://cdn.example.com/catalog/yupoo/4372478/225167978/01-gallery.jpg",
    ])
  })

  test("standalone re-run after category ingest keeps category metadata stable", async () => {
    const raw = parseYupooAlbumHtml(SAMPLE_HTML, SAMPLE_URL)
    const categoryContext = {
      categoryId: "4372478",
      categoryTitle: "【乔丹1代系列】",
      categoryUrl: "https://lol2021.x.yupoo.com/categories/4372478",
      storageCategoryId: "4372478",
    }

    await runAlbumIngestion(
      {
        mode: "album",
        url: SAMPLE_URL,
        categoryContext: {
          categoryId: categoryContext.categoryId,
          categoryTitle: categoryContext.categoryTitle,
          categoryUrl: categoryContext.categoryUrl,
        },
      },
      {
        extractAlbum: async () => raw,
        resolveCategoryContext: ({ albumId, inputCategoryContext }) =>
          resolveAlbumCategoryContext({ albumId, inputCategoryContext }),
        materializeImages: async () => [
          "https://cdn.example.com/catalog/yupoo/4372478/225167978/00-cover.jpg",
          "https://cdn.example.com/catalog/yupoo/4372478/225167978/01-gallery.jpg",
        ],
        persistItem: persistCatalogItem,
      },
    )

    const second = await runAlbumIngestion(
      { mode: "album", url: SAMPLE_URL },
      {
        extractAlbum: async () => raw,
        resolveCategoryContext: ({ albumId, inputCategoryContext }) =>
          resolveAlbumCategoryContext({ albumId, inputCategoryContext }),
        materializeImages: async () => [
          "https://cdn.example.com/catalog/yupoo/4372478/225167978/00-cover.jpg",
          "https://cdn.example.com/catalog/yupoo/4372478/225167978/01-gallery.jpg",
        ],
        persistItem: persistCatalogItem,
      },
    )

    const records = await listCatalogItems({ sourceIds: ["225167978"] })

    expect(second.status).toBe("success")
    expect(second.skipped).toBe(1)
    expect(records[0].extra.category_id).toBe("4372478")
    expect(records[0].extra.category_title).toBe("【乔丹1代系列】")
    expect(records[0].extra.category_url).toBe("https://lol2021.x.yupoo.com/categories/4372478")
  })

  test("updates an existing catalog item when the normalized oss image list changes", async () => {
    const raw = parseYupooAlbumHtml(SAMPLE_HTML, SAMPLE_URL)

    await runAlbumIngestion(
      { mode: "album", url: SAMPLE_URL },
      {
        extractAlbum: async () => raw,
        resolveCategoryContext: async () => ({ storageCategoryId: "uncategorized" }),
        materializeImages: async () => [
          "https://cdn.example.com/catalog/yupoo/uncategorized/225167978/00-cover.jpg",
          "https://cdn.example.com/catalog/yupoo/uncategorized/225167978/01-gallery-a.jpg",
        ],
        persistItem: persistCatalogItem,
      },
    )

    const changed = await runAlbumIngestion(
      { mode: "album", url: SAMPLE_URL },
      {
        extractAlbum: async () => ({
          ...raw,
          sourceImageUrls: [raw.sourceImageUrls[0], "https://photo.yupoo.com/lol2021/gallery-b/raw-b.jpg"],
        }),
        resolveCategoryContext: async () => ({ storageCategoryId: "uncategorized" }),
        materializeImages: async () => [
          "https://cdn.example.com/catalog/yupoo/uncategorized/225167978/00-cover.jpg",
          "https://cdn.example.com/catalog/yupoo/uncategorized/225167978/01-gallery-b.jpg",
        ],
        persistItem: persistCatalogItem,
      },
    )

    const records = await listCatalogItems({ sourceIds: ["225167978"] })

    expect(changed.updated).toBe(1)
    expect(records[0].images).toEqual([
      "https://cdn.example.com/catalog/yupoo/uncategorized/225167978/00-cover.jpg",
      "https://cdn.example.com/catalog/yupoo/uncategorized/225167978/01-gallery-b.jpg",
    ])
  })
})
