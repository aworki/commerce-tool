import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, test } from "bun:test"
import ExcelJS from "exceljs"
import { applyTeamContentPostfill } from "./applyTeamContentPostfill.ts"
import { writeShoesWorkbook } from "./writeShoesWorkbook.ts"
import type { ShoesTransformManifestEntry, ShoesWorkbookRow } from "./types.ts"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function createTemplateWorkbook(sheetName = "商品信息") {
  const dir = await mkdtemp(join(tmpdir(), "shoes-postfill-"))
  tempDirs.push(dir)

  const templatePath = join(dir, `${randomUUID()}.xlsx`)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  workbook.addWorksheet("计量单位")

  sheet.getCell("A1").value = "说明"
  sheet.getCell("A2").value = "表头"
  sheet.getCell("A3").value = "格式"
  sheet.getCell("A4").value = "规则"
  sheet.getCell("B5").font = { name: "宋体", bold: true }
  sheet.getCell("AB6").font = { name: "宋体", italic: true }

  await workbook.xlsx.writeFile(templatePath)
  return { dir, templatePath }
}

async function createExportedWorkbook(input: {
  rows: ShoesWorkbookRow[]
  templateSheetName?: string
}) {
  const { dir, templatePath } = await createTemplateWorkbook(input.templateSheetName)
  const workbookPath = join(dir, "exported.xlsx")

  await writeShoesWorkbook({
    templatePath,
    outputPath: workbookPath,
    rows: input.rows,
  })

  return { dir, workbookPath }
}

async function readWorkbookSheet(workbookPath: string) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(workbookPath)
  return workbook.getWorksheet("商品信息")
}

describe("applyTeamContentPostfill", () => {
  test("writes D/G/T/U on first rows only using manifest row numbers for multiple products", async () => {
    const rows: ShoesWorkbookRow[] = [
      {
        kind: "first",
        cells: {
          B: "Alpha Original Title",
          AB: "Size:40",
        },
      },
      {
        kind: "continuation",
        cells: {
          AB: "Size:40.5",
        },
      },
      {
        kind: "first",
        cells: {
          B: "Beta Original Title",
          AB: "Size:41",
        },
      },
    ]
    const manifest: ShoesTransformManifestEntry[] = [
      {
        sourceId: "alpha-1",
        title: "Alpha Launch",
        firstRowNumber: 5,
      },
      {
        sourceId: "beta-2",
        title: "Beta Launch",
        firstRowNumber: 7,
      },
    ]
    const { workbookPath } = await createExportedWorkbook({ rows })

    const result = await applyTeamContentPostfill({
      workbookPath,
      manifest,
      template: {
        teamDescription: "Jordan Team",
        productDescriptionTemplate: "商品描述 {{title}}",
        keyInformationTemplate: "关键信息 {{title}}",
        seoTitleTemplate: "SEO标题 {{title}}",
        seoDescriptionTemplate: "SEO描述 {{title}}",
      },
    })

    const sheet = await readWorkbookSheet(workbookPath)

    expect(result.productsUpdated).toBe(2)
    expect(result.updatedSourceIds).toEqual(new Set(["alpha-1", "beta-2"]))
    expect(result.warnings).toEqual([])
    expect(sheet?.getCell("D5").value).toBe("商品描述 Alpha Launch")
    expect(sheet?.getCell("G5").value).toBe("关键信息 Alpha Launch")
    expect(sheet?.getCell("T5").value).toBe("SEO标题 Alpha Launch")
    expect(sheet?.getCell("U5").value).toBe("SEO描述 Alpha Launch")
    expect(sheet?.getCell("D6").value).toBeNull()
    expect(sheet?.getCell("G6").value).toBeNull()
    expect(sheet?.getCell("T6").value).toBeNull()
    expect(sheet?.getCell("U6").value).toBeNull()
    expect(sheet?.getCell("D7").value).toBe("商品描述 Beta Launch")
    expect(sheet?.getCell("G7").value).toBe("关键信息 Beta Launch")
    expect(sheet?.getCell("T7").value).toBe("SEO标题 Beta Launch")
    expect(sheet?.getCell("U7").value).toBe("SEO描述 Beta Launch")
    expect(sheet?.getCell("B5").value).toBe("Alpha Original Title")
    expect(sheet?.getCell("AB6").value).toBe("Size:40.5")
    expect(sheet?.getCell("B7").value).toBe("Beta Original Title")
  })

  test("continues after per-product failures and leaves failed products untouched", async () => {
    const rows: ShoesWorkbookRow[] = [
      {
        kind: "first",
        cells: {
          B: "Alpha Original Title",
        },
      },
      {
        kind: "first",
        cells: {
          B: "Beta Original Title",
        },
      },
    ]
    const manifest: ShoesTransformManifestEntry[] = [
      {
        sourceId: "alpha-1",
        title: "Alpha Launch",
        firstRowNumber: 5,
      },
      {
        sourceId: "beta-2",
        title: "   ",
        firstRowNumber: 6,
      },
      {
        sourceId: "gamma-3",
        title: "Gamma Launch",
        firstRowNumber: 999,
      },
    ]
    const { workbookPath } = await createExportedWorkbook({ rows })

    const result = await applyTeamContentPostfill({
      workbookPath,
      manifest,
      template: {
        teamDescription: "Jordan Team",
        productDescriptionTemplate: "商品描述 {{title}}",
        keyInformationTemplate: "关键信息 {{title}}",
        seoTitleTemplate: "SEO标题 {{title}}",
        seoDescriptionTemplate: "{{title}}",
      },
    })

    const sheet = await readWorkbookSheet(workbookPath)

    expect(result.productsUpdated).toBe(1)
    expect(result.updatedSourceIds).toEqual(new Set(["alpha-1"]))
    expect(result.warnings).toEqual([
      {
        sourceId: "beta-2",
        firstRowNumber: 6,
        reason: "blank_generated_value",
        message: "generated team-content values contain an empty field after trimming",
      },
      {
        sourceId: "gamma-3",
        firstRowNumber: 999,
        reason: "row_not_found",
        message: "could not locate the product first row on 商品信息",
      },
    ])
    expect(sheet?.getCell("D5").value).toBe("商品描述 Alpha Launch")
    expect(sheet?.getCell("G5").value).toBe("关键信息 Alpha Launch")
    expect(sheet?.getCell("T5").value).toBe("SEO标题 Alpha Launch")
    expect(sheet?.getCell("U5").value).toBe("Alpha Launch")
    expect(sheet?.getCell("D6").value).toBeNull()
    expect(sheet?.getCell("G6").value).toBeNull()
    expect(sheet?.getCell("T6").value).toBeNull()
    expect(sheet?.getCell("U6").value).toBeNull()
  })

  test("throws when the exported workbook is missing the 商品信息 sheet", async () => {
    const { dir, templatePath } = await createTemplateWorkbook("错误工作表")
    const workbookPath = join(dir, "wrong-sheet.xlsx")

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templatePath)
    await workbook.xlsx.writeFile(workbookPath)

    await expect(applyTeamContentPostfill({
      workbookPath,
      manifest: [
        {
          sourceId: "alpha-1",
          title: "Alpha Launch",
          firstRowNumber: 5,
        },
      ],
      template: {
        teamDescription: "Jordan Team",
        productDescriptionTemplate: "商品描述 {{title}}",
        keyInformationTemplate: "关键信息 {{title}}",
        seoTitleTemplate: "SEO标题 {{title}}",
        seoDescriptionTemplate: "SEO描述 {{title}}",
      },
    })).rejects.toThrow("workbook is missing the 商品信息 sheet")
  })
})
