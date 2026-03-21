import { describe, expect, test } from "bun:test"
import { parseYupooCategoryHtml } from "./extractYupooCategoryLinks.ts"
import { runCategoryIngestion } from "./runCategoryIngestion.ts"

const CATEGORY_URL = "https://lol2021.x.yupoo.com/categories/4372478"
const PAGE_2_URL = "https://lol2021.x.yupoo.com/categories/4372478?page=2"

const CATEGORY_PAGE_1_HTML = `
<!doctype html>
<html>
  <head>
    <title>【乔丹1代系列】 | 分类 | 九龙鞋业</title>
    <script>
      window.OWNER = 'lol2021'
    </script>
  </head>
  <body>
    <h1>【乔丹1代系列】</h1>
    <div class="meta">共689个相册 / 共6页 / 1 / 6</div>
    <ul class="album-list">
      <li><a href="/albums/229183591?uid=1&isSubCate=false&referrercate=4372478" title="鞋子A">鞋子A</a></li>
      <li><a href="/albums/229183592?uid=1&isSubCate=false&referrercate=4372478" title="鞋子B">鞋子B</a></li>
      <li><a href="/albums/229183593?uid=1&isSubCate=false&referrercate=4372478" title="鞋子C">鞋子C</a></li>
    </ul>
    <div class="pagination">
      <a href="/categories/4372478?page=2">下一页</a>
    </div>
  </body>
</html>
`

const CATEGORY_PAGE_2_HTML = `
<!doctype html>
<html>
  <head>
    <title>【乔丹1代系列】 | 分类 | 九龙鞋业</title>
  </head>
  <body>
    <h1>【乔丹1代系列】</h1>
    <div class="meta">共689个相册 / 共6页 / 2 / 6</div>
    <ul class="album-list">
      <li><a href="/albums/229183594?uid=1&isSubCate=false&referrercate=4372478" title="鞋子D">鞋子D</a></li>
      <li><a href="/albums/229183595?uid=1&isSubCate=false&referrercate=4372478" title="鞋子E">鞋子E</a></li>
      <li><a href="/albums/229183592?uid=1&isSubCate=false&referrercate=4372478" title="鞋子B">鞋子B</a></li>
    </ul>
  </body>
</html>
`

describe("category ingestion", () => {
  test("parses a yupoo category page into title, counts, album links, and next page", () => {
    const parsed = parseYupooCategoryHtml(CATEGORY_PAGE_1_HTML, CATEGORY_URL)

    expect(parsed.categoryId).toBe("4372478")
    expect(parsed.categoryTitle).toBe("【乔丹1代系列】")
    expect(parsed.estimatedTotalAlbums).toBe(689)
    expect(parsed.currentPage).toBe(1)
    expect(parsed.totalPages).toBe(6)
    expect(parsed.albumUrls).toEqual([
      "https://lol2021.x.yupoo.com/albums/229183591?uid=1&isSubCate=false&referrercate=4372478",
      "https://lol2021.x.yupoo.com/albums/229183592?uid=1&isSubCate=false&referrercate=4372478",
      "https://lol2021.x.yupoo.com/albums/229183593?uid=1&isSubCate=false&referrercate=4372478",
    ])
    expect(parsed.nextPageUrl).toBe(PAGE_2_URL)
  })

  test("runs category ingestion as a best-effort orchestrator and stops after estimated page count", async () => {
    const fetchedPages: string[] = []
    const processedAlbums: string[] = []

    const result = await runCategoryIngestion(
      {
        mode: "category",
        url: CATEGORY_URL,
        limit: 4,
      },
      {
        fetchCategoryPage: async (url) => {
          fetchedPages.push(url)
          if (url === CATEGORY_URL) return CATEGORY_PAGE_1_HTML
          if (url === PAGE_2_URL) return CATEGORY_PAGE_2_HTML
          throw new Error(`unexpected page fetch: ${url}`)
        },
        runAlbum: async (url) => {
          processedAlbums.push(url)

          if (url.includes("229183594")) {
            return {
              status: "error",
              sourceType: "album",
              sourceUrl: url,
              inserted: 0,
              updated: 0,
              skipped: 0,
              error: "album failed",
            }
          }

          return {
            status: "success",
            sourceType: "album",
            sourceUrl: url,
            inserted: 1,
            updated: 0,
            skipped: 0,
          }
        },
      },
    )

    expect(fetchedPages).toEqual([CATEGORY_URL, PAGE_2_URL])
    expect(processedAlbums).toEqual([
      "https://lol2021.x.yupoo.com/albums/229183591?uid=1&isSubCate=false&referrercate=4372478",
      "https://lol2021.x.yupoo.com/albums/229183592?uid=1&isSubCate=false&referrercate=4372478",
      "https://lol2021.x.yupoo.com/albums/229183593?uid=1&isSubCate=false&referrercate=4372478",
      "https://lol2021.x.yupoo.com/albums/229183594?uid=1&isSubCate=false&referrercate=4372478",
      "https://lol2021.x.yupoo.com/albums/229183595?uid=1&isSubCate=false&referrercate=4372478",
    ])

    expect(result.status).toBe("success")
    expect(result.sourceType).toBe("category")
    expect(result.estimatedTotalAlbums).toBe(689)
    expect(result.plannedPages).toBe(2)
    expect(result.processedAlbums).toBe(5)
    expect(result.inserted).toBe(4)
    expect(result.failed).toBe(1)
    expect(result.albumResults[3].status).toBe("error")
    expect(result.albumResults[3].sourceUrl).toContain("229183594")
  })
})
