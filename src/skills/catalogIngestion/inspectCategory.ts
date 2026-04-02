import { parseYupooCategoryHtml } from "./extractYupooCategoryLinks.ts"

type InspectCategoryDeps = {
  fetchCategoryPage: (url: string) => Promise<string>
}

export type CategoryInspectionView = {
  categoryTitle: string
  estimatedTotalAlbums: number
  estimatedPageSize: number
  plannedPages: number
  requestedLimit: number
}

function plannedPagesFor(totalPages: number, estimatedPageSize: number, limit: number): number {
  return Math.min(totalPages, Math.max(1, Math.ceil(limit / Math.max(estimatedPageSize, 1))))
}

function defaultDeps(): InspectCategoryDeps {
  return {
    fetchCategoryPage: async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`category page load failed: ${response.status}`)
      return response.text()
    },
  }
}

export async function inspectCategory(url: string, limit: number, deps: InspectCategoryDeps = defaultDeps()): Promise<CategoryInspectionView> {
  const html = await deps.fetchCategoryPage(url)
  const parsed = parseYupooCategoryHtml(html, url)
  const estimatedPageSize = Math.max(parsed.albumUrls.length, 1)

  return {
    categoryTitle: parsed.categoryTitle,
    estimatedTotalAlbums: parsed.estimatedTotalAlbums,
    estimatedPageSize,
    plannedPages: plannedPagesFor(parsed.totalPages, estimatedPageSize, limit),
    requestedLimit: limit,
  }
}
