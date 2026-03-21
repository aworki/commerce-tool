import { describe, expect, test } from "bun:test"
import { inspectCategory } from "./inspectCategory.ts"
import { ingestCategory } from "./ingestCategory.ts"

const CATEGORY_URL = "https://lol2021.x.yupoo.com/categories/4372478"

const CATEGORY_PAGE_HTML = `
<!doctype html>
<html>
  <head>
    <title>【乔丹1代系列】 | 分类 | 九龙鞋业</title>
  </head>
  <body>
    <h1>【乔丹1代系列】</h1>
    <div class="meta">共689个相册 / 共6页 / 1 / 6</div>
    <ul>
      <li><a href="/albums/229183591?uid=1&isSubCate=false&referrercate=4372478">鞋子A</a></li>
      <li><a href="/albums/229183592?uid=1&isSubCate=false&referrercate=4372478">鞋子B</a></li>
      <li><a href="/albums/229183593?uid=1&isSubCate=false&referrercate=4372478">鞋子C</a></li>
    </ul>
    <a href="/categories/4372478?page=2">下一页</a>
  </body>
</html>
`

describe("category CLI helpers", () => {
  test("inspects a category and returns estimate plus page planning", async () => {
    const result = await inspectCategory(CATEGORY_URL, 50, {
      fetchCategoryPage: async () => CATEGORY_PAGE_HTML,
    })

    expect(result.categoryTitle).toBe("【乔丹1代系列】")
    expect(result.estimatedTotalAlbums).toBe(689)
    expect(result.estimatedPageSize).toBe(3)
    expect(result.plannedPages).toBe(6)
    expect(result.requestedLimit).toBe(50)
  })

  test("ingestCategory delegates to runCategoryIngestion with explicit limit", async () => {
    const result = await ingestCategory(CATEGORY_URL, 20, {
      runCategory: async (input) => ({
        status: "success",
        sourceType: "category",
        sourceUrl: input.url,
        estimatedTotalAlbums: 689,
        plannedPages: 2,
        processedAlbums: 21,
        inserted: 20,
        updated: 0,
        skipped: 0,
        failed: 1,
        albumResults: [],
      }),
    })

    expect(result.status).toBe("success")
    expect(result.sourceType).toBe("category")
    expect(result.plannedPages).toBe(2)
    expect(result.inserted).toBe(20)
    expect(result.failed).toBe(1)
  })
})
