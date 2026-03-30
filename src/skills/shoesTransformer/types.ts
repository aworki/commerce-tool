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

export type ShoesTransformWarning = {
  sourceId: string
  field: string
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

export type ShoesTransformResult = {
  status: "success" | "error"
  outputPath: string
  exportedItems: number
  exportedRows: number
  warnings: ShoesTransformWarning[]
  error?: string
}
