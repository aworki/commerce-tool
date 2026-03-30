import { extractYupooAlbum } from "./extractYupooAlbum.ts"
import { resolveAlbumCategoryContext } from "./loadExistingAlbumContext.ts"
import { materializeAlbumImagesToOss } from "./materializeAlbumImagesToOss.ts"
import { normalizeYupooAlbum } from "./normalizeYupooAlbum.ts"
import { persistCatalogItem } from "./persistCatalogItem.ts"
import type {
  CatalogIngestionInput,
  CatalogIngestionResult,
  CategoryContext,
  RawYupooAlbum,
  ResolvedAlbumCategoryContext,
} from "./types.ts"

type AlbumIngestionDeps = {
  extractAlbum: (url: string) => Promise<RawYupooAlbum>
  resolveCategoryContext: (args: {
    albumId: string
    inputCategoryContext?: CategoryContext
  }) => Promise<ResolvedAlbumCategoryContext>
  materializeImages: (args: {
    albumId: string
    sourceUrl: string
    storageCategoryId: string
    sourceImageUrls: string[]
  }) => Promise<string[]>
  persistItem: typeof persistCatalogItem
}

function defaultDeps(): AlbumIngestionDeps {
  return {
    extractAlbum: extractYupooAlbum,
    resolveCategoryContext: ({ albumId, inputCategoryContext }) =>
      resolveAlbumCategoryContext({ albumId, inputCategoryContext }),
    materializeImages: ({ albumId, sourceUrl, storageCategoryId, sourceImageUrls }) =>
      materializeAlbumImagesToOss({ albumId, sourceUrl, storageCategoryId, sourceImageUrls }),
    persistItem: persistCatalogItem,
  }
}

export async function runAlbumIngestion(
  input: CatalogIngestionInput,
  deps: AlbumIngestionDeps = defaultDeps(),
): Promise<CatalogIngestionResult> {
  try {
    const rawAlbum = await deps.extractAlbum(input.url)
    const resolvedCategoryContext = await deps.resolveCategoryContext({
      albumId: rawAlbum.albumId,
      inputCategoryContext: input.categoryContext,
    })
    const ossImageUrls = await deps.materializeImages({
      albumId: rawAlbum.albumId,
      sourceUrl: rawAlbum.sourceUrl,
      storageCategoryId: resolvedCategoryContext.storageCategoryId,
      sourceImageUrls: rawAlbum.sourceImageUrls,
    })
    const item = normalizeYupooAlbum(rawAlbum, ossImageUrls, resolvedCategoryContext)
    const persist = await deps.persistItem(item)

    return {
      status: "success",
      sourceType: "album",
      sourceUrl: input.url,
      inserted: persist.action === "inserted" ? 1 : 0,
      updated: persist.action === "updated" ? 1 : 0,
      skipped: persist.action === "skipped" ? 1 : 0,
      item,
    }
  } catch (error) {
    return {
      status: "error",
      sourceType: "album",
      sourceUrl: input.url,
      inserted: 0,
      updated: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : "unknown error",
    }
  }
}
