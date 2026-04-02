import ExcelJS from "exceljs"
import type { TeamContentTemplateInput } from "./validateTeamContentTemplate.ts"
import type {
  ShoesTeamContentPostfillAppliedSummary,
  ShoesTeamContentPostfillWarning,
  ShoesTransformManifestEntry,
} from "./types.ts"

type TeamContentPostfillValues = {
  productDescription: string
  keyInformation: string
  seoTitle: string
  seoDescription: string
}

function renderTemplate(template: string, title: string): string {
  return template.replaceAll("{{title}}", title).trim()
}

function renderTemplateValues(template: TeamContentTemplateInput, title: string): TeamContentPostfillValues {
  return {
    productDescription: renderTemplate(template.productDescriptionTemplate, title),
    keyInformation: renderTemplate(template.keyInformationTemplate, title),
    seoTitle: renderTemplate(template.seoTitleTemplate, title),
    seoDescription: renderTemplate(template.seoDescriptionTemplate, title),
  }
}

function createWarning(
  entry: ShoesTransformManifestEntry,
  reason: ShoesTeamContentPostfillWarning["reason"],
  message: string,
): ShoesTeamContentPostfillWarning {
  return {
    sourceId: entry.sourceId,
    firstRowNumber: entry.firstRowNumber,
    reason,
    message,
  }
}

function hasBlankGeneratedValue(values: TeamContentPostfillValues): boolean {
  return Object.values(values).some((value) => value.length === 0)
}

function isProductFirstRow(row: ExcelJS.Row): boolean {
  const titleCellValue = row.getCell("B").value
  return typeof titleCellValue === "string"
    ? titleCellValue.trim().length > 0
    : titleCellValue != null
}

export async function applyTeamContentPostfill(input: {
  workbookPath: string
  manifest: ShoesTransformManifestEntry[]
  template: TeamContentTemplateInput
}): Promise<ShoesTeamContentPostfillAppliedSummary> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(input.workbookPath)

  const sheet = workbook.getWorksheet("商品信息")

  if (!sheet) {
    throw new Error("workbook is missing the 商品信息 sheet")
  }

  const updatedSourceIds = new Set<string>()
  const warnings: ShoesTeamContentPostfillWarning[] = []

  for (const entry of input.manifest) {
    const values = renderTemplateValues(input.template, entry.title)

    if (hasBlankGeneratedValue(values)) {
      warnings.push(createWarning(
        entry,
        "blank_generated_value",
        "generated team-content values contain an empty field after trimming",
      ))
      continue
    }

    const row = sheet.getRow(entry.firstRowNumber)

    if (!isProductFirstRow(row)) {
      warnings.push(createWarning(
        entry,
        "row_not_found",
        "could not locate the product first row on 商品信息",
      ))
      continue
    }

    row.getCell("D").value = values.productDescription
    row.getCell("G").value = values.keyInformation
    row.getCell("T").value = values.seoTitle
    row.getCell("U").value = values.seoDescription
    updatedSourceIds.add(entry.sourceId)
  }

  await workbook.xlsx.writeFile(input.workbookPath)

  return {
    status: "applied",
    productsAttempted: input.manifest.length,
    productsUpdated: updatedSourceIds.size,
    updatedSourceIds,
    warnings,
  }
}
