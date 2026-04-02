import { runCategoryIngestion } from "./runCategoryIngestion.ts"
import type { CategoryIngestionInput, CategoryIngestionResult } from "./types.ts"

type IngestCategoryDeps = {
  runCategory: (input: CategoryIngestionInput) => Promise<CategoryIngestionResult>
}

function defaultDeps(): IngestCategoryDeps {
  return {
    runCategory: runCategoryIngestion,
  }
}

export async function ingestCategory(url: string, limit: number, deps: IngestCategoryDeps = defaultDeps()): Promise<CategoryIngestionResult> {
  return deps.runCategory({
    mode: "category",
    url,
    limit,
  })
}
