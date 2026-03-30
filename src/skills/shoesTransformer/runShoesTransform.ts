import { buildWorkbookRows } from "./buildWorkbookRows.ts"
import { loadCatalogItems } from "./loadCatalogItems.ts"
import { normalizeCatalogItemForShoes } from "./normalizeCatalogItemForShoes.ts"
import { validateShoesTransform } from "./validateShoesTransform.ts"
import { writeShoesWorkbook } from "./writeShoesWorkbook.ts"
import type { ShoesTransformInput, ShoesTransformResult } from "./types.ts"

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

export async function runShoesTransform(input: ShoesTransformInput): Promise<ShoesTransformResult> {
  try {
    const items = await loadCatalogItems({
      ids: input.ids,
      sourceIds: input.sourceIds,
      sourceUrls: input.sourceUrls,
      categoryIds: input.categoryIds,
      categoryUrls: input.categoryUrls,
    })

    const normalizedItems = items.map((item) => normalizeCatalogItemForShoes(item, {
      tags: normalizeTags(input.tags),
    }))
    const rows = normalizedItems.flatMap(buildWorkbookRows)
    const warnings = validateShoesTransform(normalizedItems)

    await writeShoesWorkbook({
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
    }
  } catch (error) {
    return {
      status: "error",
      outputPath: input.outputPath,
      exportedItems: 0,
      exportedRows: 0,
      warnings: [],
      error: error instanceof Error ? error.message : "unknown error",
    }
  }
}
