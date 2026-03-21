import { extractYupooAlbum } from "./extractYupooAlbum.ts"
import { normalizeYupooAlbum } from "./normalizeYupooAlbum.ts"
import { persistCatalogItem } from "./persistCatalogItem.ts"
import type { CatalogIngestionInput, CatalogIngestionResult } from "./types.ts"

export async function runAlbumIngestion(input: CatalogIngestionInput): Promise<CatalogIngestionResult> {
  try {
    const rawAlbum = await extractYupooAlbum(input.url)
    const item = normalizeYupooAlbum(rawAlbum)
    const persist = await persistCatalogItem(item)

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
