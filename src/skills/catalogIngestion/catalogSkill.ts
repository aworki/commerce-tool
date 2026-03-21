import { isYupooAlbumUrl, isYupooCategoryUrl } from "../../lib/urls.ts"
import { runAlbumIngestion } from "./runAlbumIngestion.ts"
import { runCategoryIngestion } from "./runCategoryIngestion.ts"
import type { AlbumIngestionInput, AlbumIngestionResult, CategoryIngestionInput, CategoryIngestionResult } from "./types.ts"

type CatalogSkillDeps = {
  runAlbum: (input: AlbumIngestionInput) => Promise<AlbumIngestionResult>
  runCategory: (input: CategoryIngestionInput) => Promise<CategoryIngestionResult>
}

type CatalogSkillExecuteInput = {
  url: string
  limit?: number
}

function defaultDeps(): CatalogSkillDeps {
  return {
    runAlbum: runAlbumIngestion,
    runCategory: runCategoryIngestion,
  }
}

export function createCatalogIngestionSkill(deps: CatalogSkillDeps = defaultDeps()) {
  return {
    name: "catalog-ingestion",
    description: "Ingest Yupoo album or category data into the default PostgreSQL database.",
    async execute(input: CatalogSkillExecuteInput) {
      if (isYupooAlbumUrl(input.url)) {
        return deps.runAlbum({
          mode: "album",
          url: input.url,
        })
      }

      if (isYupooCategoryUrl(input.url) && typeof input.limit === "number" && input.limit > 0) {
        return deps.runCategory({
          mode: "category",
          url: input.url,
          limit: input.limit,
        })
      }

      return {
        status: "error" as const,
        sourceType: isYupooCategoryUrl(input.url) ? "category" as const : "album" as const,
        sourceUrl: input.url,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error: "unsupported input: only Yupoo album URLs or category URLs with a positive limit are accepted",
      }
    },
  }
}
