import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, test } from "bun:test"
import ExcelJS from "exceljs"
import { writeShoesWorkbook } from "./writeShoesWorkbook.ts"
import type { ShoesWorkbookRow } from "./types.ts"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function createTemplateWorkbook() {
  const dir = await mkdtemp(join(tmpdir(), "shoes-transformer-"))
  tempDirs.push(dir)

  const templatePath = join(dir, `${randomUUID()}.xlsx`)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("商品信息")
  const units = workbook.addWorksheet("计量单位")

  sheet.getCell("A1").value = "说明"
  sheet.getCell("A2").value = "表头"
  sheet.getCell("A3").value = "格式"
  sheet.getCell("A4").value = "规则"

  sheet.getRow(5).height = 30
  sheet.getCell("B5").font = { name: "宋体", bold: true }
  sheet.getCell("AB5").alignment = { wrapText: true, vertical: "middle" }
  sheet.getCell("AF5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE9D9" } }

  sheet.getRow(6).height = 24
  sheet.getCell("AB6").font = { name: "宋体", italic: true }
  sheet.getCell("AF6").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } }

  sheet.getCell("AB7").value = "Size:legacy-1"
  sheet.getCell("AD7").value = 99
  sheet.getCell("AB8").value = "Size:legacy-2"
  sheet.getCell("AD8").value = 99

  units.getCell("A1").value = "双"

  await workbook.xlsx.writeFile(templatePath)
  return { dir, templatePath }
}

describe("writeShoesWorkbook", () => {
  test("writes export rows into the template while preserving header rows and styles", async () => {
    const { dir, templatePath } = await createTemplateWorkbook()
    const outputPath = join(dir, "output.xlsx")
    const rows: ShoesWorkbookRow[] = [
      {
        kind: "first",
        cells: {
          B: "【DA7OG】 IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
          E: "https://img.example/cover.jpg",
          X: "Size\n36\n36.5",
          AB: "Size:36",
          AD: null,
          AF: null,
        },
      },
      {
        kind: "continuation",
        cells: {
          AB: "Size:36.5",
          AD: null,
          AF: null,
        },
      },
    ]

    await writeShoesWorkbook({ templatePath, outputPath, rows })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(outputPath)

    const sheet = workbook.getWorksheet("商品信息")
    const units = workbook.getWorksheet("计量单位")

    expect(sheet?.getCell("A1").value).toBe("说明")
    expect(sheet?.getCell("B5").value).toBe("【DA7OG】 IQ7604-100 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'")
    expect(sheet?.getCell("E5").value).toBe("https://img.example/cover.jpg")
    expect(sheet?.getCell("AB6").value).toBe("Size:36.5")
    expect(sheet?.getCell("B5").font?.name).toBe("宋体")
    expect(sheet?.getCell("AB6").font?.italic).toBe(true)
    expect(sheet?.getCell("AD5").value).toBeNull()
    expect(sheet?.getCell("AF5").value).toBeNull()
    expect(sheet?.getCell("AD6").value).toBeNull()
    expect(sheet?.getCell("AF6").value).toBeNull()
    expect(sheet?.getCell("AB7").value).toBeNull()
    expect(sheet?.getCell("AD7").value).toBeNull()
    expect(sheet?.getCell("AB8").value).toBeNull()
    expect(sheet?.getCell("AD8").value).toBeNull()
    expect(units?.getCell("A1").value).toBe("双")
  })
})
