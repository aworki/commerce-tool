import type { CatalogItemRecord, CatalogItemSelectors } from "../../db/catalogItems.ts"

export const SHOES_COLUMNS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG",
] as const

export type ShoesColumn = typeof SHOES_COLUMNS[number]
export type ShoesCellValue = string | number | null

export type ShoesTransformInput = CatalogItemSelectors & {
  outputPath: string
  templatePath?: string
  tags?: string[]
}

export const FIRST_SHOES_WORKBOOK_ROW_NUMBER = 5

export type ShoesTransformWarningKind =
  | "missing_cover_image"
  | "missing_size_spec_and_sku"
  | "manual_fill_product_description"
  | "manual_fill_key_information"
  | "manual_fill_logistics_template"
  | "manual_fill_seo_title"
  | "manual_fill_seo_description"
  | "manual_fill_sale_price"

export type ShoesTransformWarning = {
  sourceId: string
  field: string
  kind: ShoesTransformWarningKind
  message: string
}

export type ShoesNormalizedItem = {
  item: CatalogItemRecord
  cleanTitle: string
  coverImageUrl: string
  galleryImageUrls: string[]
  sizeValues: string[]
  tags: string[]
  warnings: ShoesTransformWarning[]
}

export type ShoesWorkbookRow = {
  kind: "first" | "continuation"
  cells: Partial<Record<ShoesColumn, ShoesCellValue>>
}

export type ShoesTransformManifestEntry = {
  sourceId: string
  title: string
  firstRowNumber: number
}

export type ShoesTeamContentPostfillWarningReason = "blank_generated_value" | "row_not_found"

export type ShoesTeamContentPostfillWarning = {
  sourceId: string
  firstRowNumber: number
  reason: ShoesTeamContentPostfillWarningReason
  message: string
}

export type ShoesTeamContentPostfillAppliedSummary = {
  status: "applied"
  productsAttempted: number
  productsUpdated: number
  updatedSourceIds: Set<string>
  warnings: ShoesTeamContentPostfillWarning[]
}

export type ShoesTeamContentPostfillSummary =
  | {
    status: "skipped"
  }
  | {
    status: "error"
    error: string
  }
  | ShoesTeamContentPostfillAppliedSummary

export type ShoesTransformResult = {
  status: "success" | "error"
  outputPath: string
  exportedItems: number
  exportedRows: number
  warnings: ShoesTransformWarning[]
  error?: string
}

export type ShoesTransformExecution = ShoesTransformResult & {
  manifest: ShoesTransformManifestEntry[]
}
