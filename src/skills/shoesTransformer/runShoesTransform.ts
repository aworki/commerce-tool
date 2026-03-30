import { buildWorkbookRows } from "./buildWorkbookRows.ts"
import { loadCatalogItems } from "./loadCatalogItems.ts"
import { normalizeCatalogItemForShoes } from "./normalizeCatalogItemForShoes.ts"
import { validateShoesTransform } from "./validateShoesTransform.ts"
import { writeShoesWorkbook } from "./writeShoesWorkbook.ts"
import {
  FIRST_SHOES_WORKBOOK_ROW_NUMBER,
} from "./types.ts"
import type {
  ShoesNormalizedItem,
  ShoesTransformExecution,
  ShoesTransformInput,
  ShoesTransformResult,
  ShoesWorkbookRow,
} from "./types.ts"

type ShoesTransformDeps = {
  loadCatalogItems: typeof loadCatalogItems
  writeShoesWorkbook: typeof writeShoesWorkbook
}

function defaultDeps(): ShoesTransformDeps {
  return {
    loadCatalogItems,
    writeShoesWorkbook,
  }
}

function buildExecutionData(normalizedItems: ShoesNormalizedItem[]) {
  const rows: ShoesWorkbookRow[] = []
  let nextRowNumber = FIRST_SHOES_WORKBOOK_ROW_NUMBER

  const manifest = normalizedItems.map((item) => {
    const itemRows = buildWorkbookRows(item)
    const entry = {
      sourceId: item.item.sourceId,
      title: item.cleanTitle,
      firstRowNumber: nextRowNumber,
    }

    rows.push(...itemRows)
    nextRowNumber += itemRows.length
    return entry
  })

  return {
    rows,
    manifest,
    warnings: validateShoesTransform(normalizedItems),
  }
}

export function resolveShoesTemplatePath(templatePath?: string): string {
  const resolved = templatePath ?? process.env.SHOES_TEMPLATE_PATH

  if (!resolved) {
    throw new Error("--template is required unless SHOES_TEMPLATE_PATH is set")
  }

  return resolved
}

function normalizeTags(tags: string[] | undefined): string[] {
  return (tags ?? []).map((tag) => tag.trim()).filter(Boolean)
}

export function toShoesTransformResult(execution: ShoesTransformExecution): ShoesTransformResult {
  const { manifest: _manifest, ...result } = execution
  return result
}

export async function runShoesTransformExecution(
  input: ShoesTransformInput,
  deps: ShoesTransformDeps = defaultDeps(),
): Promise<ShoesTransformExecution> {
  try {
    const items = await deps.loadCatalogItems({
      ids: input.ids,
      sourceIds: input.sourceIds,
      sourceUrls: input.sourceUrls,
      categoryIds: input.categoryIds,
      categoryUrls: input.categoryUrls,
    })

    const normalizedItems = items.map((item) => normalizeCatalogItemForShoes(item, {
      tags: normalizeTags(input.tags),
    }))
    const { rows, manifest, warnings } = buildExecutionData(normalizedItems)

    await deps.writeShoesWorkbook({
      templatePath: resolveShoesTemplatePath(input.templatePath),
      outputPath: input.outputPath,
      rows,
    })

    return {
      status: "success",
      outputPath: input.outputPath,
      exportedItems: normalizedItems.length,
      exportedRows: rows.length,
      warnings,
      manifest,
    }
  } catch (error) {
    return {
      status: "error",
      outputPath: input.outputPath,
      exportedItems: 0,
      exportedRows: 0,
      warnings: [],
      manifest: [],
      error: error instanceof Error ? error.message : "unknown error",
    }
  }
}

export async function runShoesTransform(input: ShoesTransformInput): Promise<ShoesTransformResult> {
  return toShoesTransformResult(await runShoesTransformExecution(input))
}
