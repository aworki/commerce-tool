import { parseYupooCategoryHtml } from "./extractYupooCategoryLinks.ts"
import { runAlbumIngestion } from "./runAlbumIngestion.ts"
import type { CategoryIngestionDeps, CategoryIngestionInput, CategoryIngestionResult, ParsedYupooCategoryPage } from "./types.ts"

function pageSizeFor(parsed: ParsedYupooCategoryPage): number {
  return Math.max(parsed.albumUrls.length, 1)
}

function plannedPagesFor(parsed: ParsedYupooCategoryPage, limit: number): number {
  return Math.min(parsed.totalPages, Math.max(1, Math.ceil(limit / pageSizeFor(parsed))))
}

function aggregate(results: CategoryIngestionResult["albumResults"]) {
  return results.reduce(
    (acc, result) => {
      acc.inserted += result.inserted
      acc.updated += result.updated
      acc.skipped += result.skipped
      acc.failed += result.status === "error" ? 1 : 0
      return acc
    },
    { inserted: 0, updated: 0, skipped: 0, failed: 0 },
  )
}

function defaultDeps(): CategoryIngestionDeps {
  return {
    fetchCategoryPage: async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`category page load failed: ${response.status}`)
      return response.text()
    },
    runAlbum: (input) => runAlbumIngestion(input),
  }
}

function buildAlbumInput(url: string, page: ParsedYupooCategoryPage, categoryUrl: string) {
  return {
    mode: "album" as const,
    url,
    categoryContext: {
      categoryId: page.categoryId,
      categoryTitle: page.categoryTitle,
      categoryUrl,
    },
  }
}

export async function runCategoryIngestion(
  input: CategoryIngestionInput,
  deps: CategoryIngestionDeps = defaultDeps(),
): Promise<CategoryIngestionResult> {
  try {
    const firstHtml = await deps.fetchCategoryPage(input.url)
    const firstPage = parseYupooCategoryHtml(firstHtml, input.url)
    const plannedPages = plannedPagesFor(firstPage, input.limit)

    const seen = new Set<string>()
    const albumResults: CategoryIngestionResult["albumResults"] = []

    let currentPage: ParsedYupooCategoryPage | undefined = firstPage
    let pagesFetched = 0

    while (currentPage && pagesFetched < plannedPages) {
      for (const albumUrl of currentPage.albumUrls) {
        if (seen.has(albumUrl)) continue
        seen.add(albumUrl)
        albumResults.push(await deps.runAlbum(buildAlbumInput(albumUrl, currentPage, input.url)))
      }

      pagesFetched += 1
      if (pagesFetched >= plannedPages || !currentPage.nextPageUrl) break

      const nextHtml = await deps.fetchCategoryPage(currentPage.nextPageUrl)
      currentPage = parseYupooCategoryHtml(nextHtml, currentPage.nextPageUrl)
    }

    const summary = aggregate(albumResults)

    return {
      status: "success",
      sourceType: "category",
      sourceUrl: input.url,
      estimatedTotalAlbums: firstPage.estimatedTotalAlbums,
      plannedPages: pagesFetched,
      processedAlbums: albumResults.length,
      inserted: summary.inserted,
      updated: summary.updated,
      skipped: summary.skipped,
      failed: summary.failed,
      albumResults,
    }
  } catch (error) {
    return {
      status: "error",
      sourceType: "category",
      sourceUrl: input.url,
      estimatedTotalAlbums: 0,
      plannedPages: 0,
      processedAlbums: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      albumResults: [],
      error: error instanceof Error ? error.message : "unknown error",
    }
  }
}
