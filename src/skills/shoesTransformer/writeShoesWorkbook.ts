import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import ExcelJS from "exceljs"
import { SHOES_COLUMNS } from "./types.ts"
import type { ShoesWorkbookRow } from "./types.ts"

type RowTemplate = {
  height?: number
  styles: Array<Record<string, unknown>>
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function captureRowTemplate(row: ExcelJS.Row): RowTemplate {
  return {
    height: row.height ?? undefined,
    styles: SHOES_COLUMNS.map((_, index) => clone(row.getCell(index + 1).style as Record<string, unknown>)),
  }
}

function applyRowTemplate(row: ExcelJS.Row, template: RowTemplate) {
  row.height = template.height

  SHOES_COLUMNS.forEach((column, index) => {
    row.getCell(column).style = clone(template.styles[index])
  })
}

function writeRowValues(row: ExcelJS.Row, data: ShoesWorkbookRow) {
  SHOES_COLUMNS.forEach((column) => {
    row.getCell(column).value = data.cells[column] ?? null
  })
}

export async function writeShoesWorkbook(input: {
  templatePath: string
  outputPath: string
  rows: ShoesWorkbookRow[]
}) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(input.templatePath)

  const sheet = workbook.getWorksheet("商品信息")

  if (!sheet) {
    throw new Error("template workbook is missing the 商品信息 sheet")
  }

  const firstRowTemplate = captureRowTemplate(sheet.getRow(5))
  const continuationRowTemplate = captureRowTemplate(sheet.getRow(Math.min(6, sheet.rowCount)))

  if (sheet.rowCount > 4) {
    sheet.spliceRows(5, sheet.rowCount - 4)
  }

  input.rows.forEach((rowData, index) => {
    const row = sheet.getRow(5 + index)
    applyRowTemplate(row, rowData.kind === "first" ? firstRowTemplate : continuationRowTemplate)
    writeRowValues(row, rowData)
  })

  await mkdir(dirname(input.outputPath), { recursive: true })
  await workbook.xlsx.writeFile(input.outputPath)
}
