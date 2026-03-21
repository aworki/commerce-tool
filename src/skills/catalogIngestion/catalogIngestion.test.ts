import { beforeEach, describe, expect, test } from "bun:test"
import { ensureCatalogSchema } from "../../db/schema.ts"
import { normalizeYupooAlbum } from "./normalizeYupooAlbum.ts"
import { parseYupooAlbumHtml } from "./extractYupooAlbum.ts"
import { persistCatalogItem } from "./persistCatalogItem.ts"

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
        "description": "尺码#36-#47.5 545126646 OG乔1",
        "url": "https://lol2021.x.yupoo.com/albums/225167978",
        "datePublished": "2026-02-06",
        "dateModified": "2026-02-09",
        "image": [
          "https://photo.yupoo.com/lol2021/116aa605/5638a425.jpg",
          "https://photo.yupoo.com/lol2021/a1dfdfd3/medium.jpg"
        ]
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
    expect(raw.imageUrls.length).toBe(2)
    expect(raw.rawTitle).toContain("Travis Scott")
  })

  test("normalizes and persists an album item idempotently", async () => {
    const item = normalizeYupooAlbum(parseYupooAlbumHtml(SAMPLE_HTML, SAMPLE_URL))

    const first = await persistCatalogItem(item)
    const second = await persistCatalogItem(item)

    expect(first.action).toBe("inserted")
    expect(second.action).toBe("skipped")
    expect(item.sourceId).toBe("225167978")
    expect(item.images.length).toBe(2)
    expect(item.extra.album_id).toBe("225167978")
  })
})
