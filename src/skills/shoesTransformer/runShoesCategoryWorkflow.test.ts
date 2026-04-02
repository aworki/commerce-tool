import { describe, expect, test } from "bun:test"
import { runShoesCategoryWorkflow } from "./runShoesCategoryWorkflow.ts"

describe("runShoesCategoryWorkflow", () => {
  test("crawls a category and exports the matching database items by category url", async () => {
    const calls: Array<Record<string, unknown>> = []

    const result = await runShoesCategoryWorkflow(
      {
        categoryUrl: "https://lol2021.x.yupoo.com/categories/5140640",
        limit: 114,
        outputPath: "/tmp/march.xlsx",
        templatePath: "/tmp/template.xlsx",
      },
      {
        runCategoryIngestion: async (input) => {
          calls.push({ stage: "crawl", ...input })
          return {
            status: "success",
            sourceType: "category",
            sourceUrl: input.url,
            estimatedTotalAlbums: 114,
            plannedPages: 1,
            processedAlbums: 114,
            inserted: 111,
            updated: 0,
            skipped: 0,
            failed: 0,
            albumResults: [],
          }
        },
        runShoesTransform: async (input) => {
          calls.push({ stage: "export", ...input })
          return {
            status: "success",
            outputPath: input.outputPath,
            exportedItems: 114,
            exportedRows: 1604,
            warnings: [],
          }
        },
      },
    )

    expect(calls).toEqual([
      {
        stage: "crawl",
        mode: "category",
        url: "https://lol2021.x.yupoo.com/categories/5140640",
        limit: 114,
      },
      {
        stage: "export",
        categoryUrls: ["https://lol2021.x.yupoo.com/categories/5140640"],
        outputPath: "/tmp/march.xlsx",
        templatePath: "/tmp/template.xlsx",
      },
    ])

    expect(result).toEqual({
      status: "success",
      crawl: {
        status: "success",
        sourceType: "category",
        sourceUrl: "https://lol2021.x.yupoo.com/categories/5140640",
        estimatedTotalAlbums: 114,
        plannedPages: 1,
        processedAlbums: 114,
        inserted: 111,
        updated: 0,
        skipped: 0,
        failed: 0,
        albumResults: [],
      },
      export: {
        status: "success",
        outputPath: "/tmp/march.xlsx",
        exportedItems: 114,
        exportedRows: 1604,
        warnings: [],
      },
    })
  })

  test("stops before export when the category crawl has failed albums", async () => {
    let exported = false

    const result = await runShoesCategoryWorkflow(
      {
        categoryUrl: "https://lol2021.x.yupoo.com/categories/5140640",
        limit: 114,
        outputPath: "/tmp/march.xlsx",
        templatePath: "/tmp/template.xlsx",
      },
      {
        runCategoryIngestion: async (input) => ({
          status: "success",
          sourceType: "category",
          sourceUrl: input.url,
          estimatedTotalAlbums: 114,
          plannedPages: 1,
          processedAlbums: 114,
          inserted: 111,
          updated: 0,
          skipped: 0,
          failed: 3,
          albumResults: [
            {
              status: "error",
              sourceType: "album",
              sourceUrl: "https://lol2021.x.yupoo.com/albums/1",
              inserted: 0,
              updated: 0,
              skipped: 0,
              error: "page load failed: 429",
            },
          ],
        }),
        runShoesTransform: async () => {
          exported = true
          return {
            status: "success",
            outputPath: "/tmp/march.xlsx",
            exportedItems: 114,
            exportedRows: 1604,
            warnings: [],
          }
        },
      },
    )

    expect(exported).toBe(false)
    expect(result.status).toBe("error")
    expect(result.error).toBe("category crawl completed with failed albums")
    expect(result.failedAlbumUrls).toEqual(["https://lol2021.x.yupoo.com/albums/1"])
  })
})
