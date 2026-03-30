import { describe, expect, test } from "bun:test"
import type { TeamShoesTemplateRecord } from "../../db/teamShoesTemplates.ts"
import { runShoesTransformerWithTeamContent } from "./runShoesTransformerWithTeamContent.ts"
import type { ShoesTransformExecution, ShoesTransformInput } from "./types.ts"

function createInput(): ShoesTransformInput {
  return {
    categoryIds: ["5057073"],
    outputPath: "/tmp/shoes-export.xlsx",
    templatePath: "/tmp/shoes-template.xlsx",
    tags: ["鞋类", "运动鞋", "低帮鞋"],
  }
}

function createExecution(overrides: Partial<ShoesTransformExecution> = {}): ShoesTransformExecution {
  return {
    status: "success",
    outputPath: "/tmp/shoes-export.xlsx",
    exportedItems: 1,
    exportedRows: 2,
    warnings: [
      {
        sourceId: "225167978",
        field: "D",
        kind: "manual_fill_product_description",
        message: "商品描述按当前规则留空",
      },
      {
        sourceId: "225167978",
        field: "G",
        kind: "manual_fill_key_information",
        message: "关键信息按当前规则留空",
      },
      {
        sourceId: "225167978",
        field: "T",
        kind: "manual_fill_seo_title",
        message: "SEO标题按当前规则留空",
      },
      {
        sourceId: "225167978",
        field: "U",
        kind: "manual_fill_seo_description",
        message: "SEO描述按当前规则留空",
      },
      {
        sourceId: "225167978",
        field: "M",
        kind: "manual_fill_sale_price",
        message: "销售价需要人工填写",
      },
    ],
    manifest: [
      {
        sourceId: "225167978",
        title: "Air Jordan 1 Low",
        firstRowNumber: 5,
      },
    ],
    ...overrides,
  }
}

function createTemplateRecord(overrides: Partial<TeamShoesTemplateRecord> = {}): TeamShoesTemplateRecord {
  return {
    id: 7,
    teamDescription: "Jordan 团队",
    productDescriptionTemplate: "商品描述 {{title}}",
    keyInformationTemplate: "关键信息 {{title}}",
    seoTitleTemplate: "SEO标题 {{title}}",
    seoDescriptionTemplate: "SEO描述 {{title}}",
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    ...overrides,
  }
}

describe("runShoesTransformerWithTeamContent", () => {
  test("returns the base export result unchanged when postfill is declined", async () => {
    const execution = createExecution()

    const result = await runShoesTransformerWithTeamContent({
      input: createInput(),
      runExecution: async () => execution,
      askShouldPostfill: async () => false,
    })

    expect(result.exportResult).toEqual({
      status: "success",
      outputPath: "/tmp/shoes-export.xlsx",
      exportedItems: 1,
      exportedRows: 2,
      warnings: execution.warnings,
    })
    expect(result.postfill).toEqual({ status: "skipped" })
    expect(result.selectedTemplateId).toBeUndefined()
    expect(result.finalWarnings).toEqual(execution.warnings)
  })

  test("selects an existing template by id and applies postfill", async () => {
    const execution = createExecution()
    const existingTemplate = createTemplateRecord({ id: 11, teamDescription: "Existing Team" })

    const result = await runShoesTransformerWithTeamContent({
      input: createInput(),
      runExecution: async () => execution,
      askShouldPostfill: async () => true,
      listTemplates: async () => [existingTemplate],
      chooseTemplateAction: async () => "existing",
      chooseExistingTemplateId: async (templates) => {
        expect(templates).toEqual([existingTemplate])
        return existingTemplate.id
      },
      loadTemplate: async (id) => {
        expect(id).toBe(existingTemplate.id)
        return existingTemplate
      },
      applyPostfill: async ({ workbookPath, manifest, template }) => {
        expect(workbookPath).toBe(execution.outputPath)
        expect(manifest).toEqual(execution.manifest)
        expect(template).toEqual({
          teamDescription: existingTemplate.teamDescription,
          productDescriptionTemplate: existingTemplate.productDescriptionTemplate,
          keyInformationTemplate: existingTemplate.keyInformationTemplate,
          seoTitleTemplate: existingTemplate.seoTitleTemplate,
          seoDescriptionTemplate: existingTemplate.seoDescriptionTemplate,
        })

        return {
          status: "applied",
          productsAttempted: 1,
          productsUpdated: 1,
          updatedSourceIds: new Set(["225167978"]),
          warnings: [],
        }
      },
    })

    expect(result.selectedTemplateId).toBe(existingTemplate.id)
    expect(result.postfill).toEqual({
      status: "applied",
      productsAttempted: 1,
      productsUpdated: 1,
      warnings: [],
    })
    expect(result.finalWarnings).toEqual([
      {
        sourceId: "225167978",
        field: "M",
        kind: "manual_fill_sale_price",
        message: "销售价需要人工填写",
      },
    ])
  })

  test("creates a new template from prompt values and applies it immediately", async () => {
    const execution = createExecution()
    const existingTemplate = createTemplateRecord({ id: 2, teamDescription: "Existing Team" })
    const createdTemplate = createTemplateRecord({ id: 12, teamDescription: "New Team" })

    const result = await runShoesTransformerWithTeamContent({
      input: createInput(),
      runExecution: async () => execution,
      askShouldPostfill: async () => true,
      listTemplates: async () => [existingTemplate],
      chooseTemplateAction: async () => "create",
      collectTemplateValues: async () => ({
        teamDescription: "  New Team  ",
        productDescriptionTemplate: "  商品描述 {{title}}  ",
        keyInformationTemplate: "  关键信息 {{title}}  ",
        seoTitleTemplate: "  SEO标题 {{title}}  ",
        seoDescriptionTemplate: "  SEO描述 {{title}}  ",
      }),
      createTemplate: async (input) => {
        expect(input).toEqual({
          teamDescription: "New Team",
          productDescriptionTemplate: "商品描述 {{title}}",
          keyInformationTemplate: "关键信息 {{title}}",
          seoTitleTemplate: "SEO标题 {{title}}",
          seoDescriptionTemplate: "SEO描述 {{title}}",
        })
        return createdTemplate
      },
      applyPostfill: async ({ template }) => {
        expect(template).toEqual({
          teamDescription: "New Team",
          productDescriptionTemplate: "商品描述 {{title}}",
          keyInformationTemplate: "关键信息 {{title}}",
          seoTitleTemplate: "SEO标题 {{title}}",
          seoDescriptionTemplate: "SEO描述 {{title}}",
        })

        return {
          status: "applied",
          productsAttempted: 1,
          productsUpdated: 1,
          updatedSourceIds: new Set(["225167978"]),
          warnings: [],
        }
      },
    })

    expect(result.selectedTemplateId).toBe(createdTemplate.id)
    expect(result.postfill.status).toBe("applied")
    expect(result.finalWarnings).toEqual([
      {
        sourceId: "225167978",
        field: "M",
        kind: "manual_fill_sale_price",
        message: "销售价需要人工填写",
      },
    ])
  })

  test("routes the empty state directly into create flow", async () => {
    const execution = createExecution()
    const createdTemplate = createTemplateRecord({ id: 21, teamDescription: "Empty State Team" })

    const result = await runShoesTransformerWithTeamContent({
      input: createInput(),
      runExecution: async () => execution,
      askShouldPostfill: async () => true,
      listTemplates: async () => [],
      chooseTemplateAction: async () => {
        throw new Error("should not ask whether to create when no templates exist")
      },
      collectTemplateValues: async () => ({
        teamDescription: "Empty State Team",
        productDescriptionTemplate: "商品描述 {{title}}",
        keyInformationTemplate: "关键信息 {{title}}",
        seoTitleTemplate: "SEO标题 {{title}}",
        seoDescriptionTemplate: "SEO描述 {{title}}",
      }),
      createTemplate: async () => createdTemplate,
      applyPostfill: async () => ({
        status: "applied",
        productsAttempted: 1,
        productsUpdated: 1,
        updatedSourceIds: new Set(["225167978"]),
        warnings: [],
      }),
    })

    expect(result.selectedTemplateId).toBe(createdTemplate.id)
    expect(result.postfill).toEqual({
      status: "applied",
      productsAttempted: 1,
      productsUpdated: 1,
      warnings: [],
    })
  })
})
