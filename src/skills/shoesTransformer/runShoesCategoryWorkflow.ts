import { runCategoryIngestion } from "../catalogIngestion/runCategoryIngestion.ts"
import type { CategoryIngestionInput, CategoryIngestionResult } from "../catalogIngestion/types.ts"
import { runShoesTransform } from "./runShoesTransform.ts"
import type { ShoesTransformInput, ShoesTransformResult } from "./types.ts"

export type ShoesCategoryWorkflowInput = {
  categoryUrl: string
  limit: number
  outputPath: string
  templatePath?: string
}

export type ShoesCategoryWorkflowResult = {
  status: "success" | "error"
  crawl?: CategoryIngestionResult
  export?: ShoesTransformResult
  error?: string
  failedAlbumUrls?: string[]
}

export type ShoesCategoryWorkflowDeps = {
  runCategoryIngestion: (input: CategoryIngestionInput) => Promise<CategoryIngestionResult>
  runShoesTransform: (input: ShoesTransformInput) => Promise<ShoesTransformResult>
}

function defaultDeps(): ShoesCategoryWorkflowDeps {
  return {
    runCategoryIngestion,
    runShoesTransform,
  }
}

function failedAlbumUrlsFrom(result: CategoryIngestionResult): string[] {
  return result.albumResults
    .filter((album) => album.status === "error")
    .map((album) => album.sourceUrl)
}

export async function runShoesCategoryWorkflow(
  input: ShoesCategoryWorkflowInput,
  deps: ShoesCategoryWorkflowDeps = defaultDeps(),
): Promise<ShoesCategoryWorkflowResult> {
  const crawl = await deps.runCategoryIngestion({
    mode: "category",
    url: input.categoryUrl,
    limit: input.limit,
  })

  if (crawl.status === "error") {
    return {
      status: "error",
      crawl,
      error: crawl.error ?? "category crawl failed",
    }
  }

  if (crawl.failed > 0) {
    return {
      status: "error",
      crawl,
      error: "category crawl completed with failed albums",
      failedAlbumUrls: failedAlbumUrlsFrom(crawl),
    }
  }

  const exported = await deps.runShoesTransform({
    categoryUrls: [input.categoryUrl],
    outputPath: input.outputPath,
    templatePath: input.templatePath,
  })

  if (exported.status === "error") {
    return {
      status: "error",
      crawl,
      export: exported,
      error: exported.error ?? "shoes export failed",
    }
  }

  return {
    status: "success",
    crawl,
    export: exported,
  }
}
