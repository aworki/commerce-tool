import type { ShoesTeamContentPostfillSummary, ShoesTransformWarning } from "./types.ts"

const POSTFILL_WARNING_KINDS = new Set([
  "manual_fill_product_description",
  "manual_fill_key_information",
  "manual_fill_seo_title",
  "manual_fill_seo_description",
] as const)

export function reconcilePostfillWarnings(input: {
  warnings: ShoesTransformWarning[]
  postfill: ShoesTeamContentPostfillSummary
}): ShoesTransformWarning[] {
  if (input.postfill.status !== "applied") {
    return input.warnings
  }

  return input.warnings.filter((warning) => {
    if (!POSTFILL_WARNING_KINDS.has(warning.kind)) {
      return true
    }

    return !input.postfill.updatedSourceIds.has(warning.sourceId)
  })
}
