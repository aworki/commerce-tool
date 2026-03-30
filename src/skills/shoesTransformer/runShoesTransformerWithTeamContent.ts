import {
  createTeamShoesTemplate,
  getTeamShoesTemplateById,
  listTeamShoesTemplates,
  type TeamShoesTemplateRecord,
} from "../../db/teamShoesTemplates.ts"
import { applyTeamContentPostfill } from "./applyTeamContentPostfill.ts"
import { reconcilePostfillWarnings } from "./reconcilePostfillWarnings.ts"
import { runShoesTransformExecution, toShoesTransformResult } from "./runShoesTransform.ts"
import { validateTeamContentTemplate, type TeamContentTemplateInput } from "./validateTeamContentTemplate.ts"
import type {
  ShoesTeamContentPostfillAppliedSummary,
  ShoesTeamContentPostfillWarning,
  ShoesTransformExecution,
  ShoesTransformInput,
  ShoesTransformResult,
  ShoesTransformWarning,
} from "./types.ts"

export type ShoesTransformerWithTeamContentPostfill =
  | {
    status: "skipped"
  }
  | {
    status: "error"
    error: string
  }
  | {
    status: "applied"
    productsAttempted: number
    productsUpdated: number
    warnings: ShoesTeamContentPostfillWarning[]
  }

export type ShoesTransformerWithTeamContentResult = {
  exportResult: ShoesTransformResult
  postfill: ShoesTransformerWithTeamContentPostfill
  selectedTemplateId?: number
  finalWarnings: ShoesTransformWarning[]
}

type ExistingOrCreate = "existing" | "create"

type RunShoesTransformerWithTeamContentOptions = {
  input: ShoesTransformInput
  runExecution?: typeof runShoesTransformExecution
  askShouldPostfill?: (exportResult: ShoesTransformResult) => Promise<boolean>
  listTemplates?: typeof listTeamShoesTemplates
  chooseTemplateAction?: (templates: TeamShoesTemplateRecord[]) => Promise<ExistingOrCreate>
  chooseExistingTemplateId?: (templates: TeamShoesTemplateRecord[]) => Promise<number>
  collectTemplateValues?: () => Promise<TeamContentTemplateInput>
  validateTemplate?: typeof validateTeamContentTemplate
  loadTemplate?: typeof getTeamShoesTemplateById
  createTemplate?: typeof createTeamShoesTemplate
  applyPostfill?: typeof applyTeamContentPostfill
  reconcileWarnings?: typeof reconcilePostfillWarnings
}

function missingPromptAdapter(name: string): never {
  throw new Error(`${name} prompt adapter is required for shoes-transformer-with-team-content`)
}

function skippedResult(exportResult: ShoesTransformResult): ShoesTransformerWithTeamContentResult {
  return {
    exportResult,
    postfill: { status: "skipped" },
    finalWarnings: exportResult.warnings,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error"
}

function toTemplateInput(template: TeamShoesTemplateRecord): TeamContentTemplateInput {
  return {
    teamDescription: template.teamDescription,
    productDescriptionTemplate: template.productDescriptionTemplate,
    keyInformationTemplate: template.keyInformationTemplate,
    seoTitleTemplate: template.seoTitleTemplate,
    seoDescriptionTemplate: template.seoDescriptionTemplate,
  }
}

function toPublicPostfill(summary: ShoesTeamContentPostfillAppliedSummary): ShoesTransformerWithTeamContentPostfill {
  return {
    status: "applied",
    productsAttempted: summary.productsAttempted,
    productsUpdated: summary.productsUpdated,
    warnings: summary.warnings,
  }
}

async function resolveTemplateSelection(options: {
  templates: TeamShoesTemplateRecord[]
  chooseTemplateAction: (templates: TeamShoesTemplateRecord[]) => Promise<ExistingOrCreate>
  chooseExistingTemplateId: (templates: TeamShoesTemplateRecord[]) => Promise<number>
  collectTemplateValues: () => Promise<TeamContentTemplateInput>
  validateTemplate: typeof validateTeamContentTemplate
  loadTemplate: typeof getTeamShoesTemplateById
  createTemplate: typeof createTeamShoesTemplate
}): Promise<{
  selectedTemplateId: number
  template: TeamContentTemplateInput
}> {
  const shouldCreate = options.templates.length === 0
    ? true
    : await options.chooseTemplateAction(options.templates) === "create"

  if (shouldCreate) {
    const values = await options.collectTemplateValues()
    const validated = options.validateTemplate(values)
    const created = await options.createTemplate(validated)

    return {
      selectedTemplateId: created.id,
      template: validated,
    }
  }

  const templateId = await options.chooseExistingTemplateId(options.templates)
  const existing = await options.loadTemplate(templateId)

  if (!existing) {
    throw new Error(`team shoes template not found for id ${templateId}`)
  }

  return {
    selectedTemplateId: existing.id,
    template: toTemplateInput(existing),
  }
}

export async function runShoesTransformerWithTeamContent(
  options: RunShoesTransformerWithTeamContentOptions,
): Promise<ShoesTransformerWithTeamContentResult> {
  const runExecution = options.runExecution ?? runShoesTransformExecution
  const askShouldPostfill = options.askShouldPostfill ?? (async () => missingPromptAdapter("askShouldPostfill"))
  const listTemplates = options.listTemplates ?? listTeamShoesTemplates
  const chooseTemplateAction = options.chooseTemplateAction ?? (async () => missingPromptAdapter("chooseTemplateAction"))
  const chooseExistingTemplateId = options.chooseExistingTemplateId ?? (async () => missingPromptAdapter("chooseExistingTemplateId"))
  const collectTemplateValues = options.collectTemplateValues ?? (async () => missingPromptAdapter("collectTemplateValues"))
  const validateTemplate = options.validateTemplate ?? validateTeamContentTemplate
  const loadTemplate = options.loadTemplate ?? getTeamShoesTemplateById
  const createTemplate = options.createTemplate ?? createTeamShoesTemplate
  const applyPostfillStep = options.applyPostfill ?? applyTeamContentPostfill
  const reconcileWarnings = options.reconcileWarnings ?? reconcilePostfillWarnings

  const execution: ShoesTransformExecution = await runExecution(options.input)
  const exportResult = toShoesTransformResult(execution)

  if (exportResult.status === "error") {
    return skippedResult(exportResult)
  }

  const shouldPostfill = await askShouldPostfill(exportResult)

  if (!shouldPostfill) {
    return skippedResult(exportResult)
  }

  try {
    const templates = await listTemplates()
    const selection = await resolveTemplateSelection({
      templates,
      chooseTemplateAction,
      chooseExistingTemplateId,
      collectTemplateValues,
      validateTemplate,
      loadTemplate,
      createTemplate,
    })
    const postfill = await applyPostfillStep({
      workbookPath: execution.outputPath,
      manifest: execution.manifest,
      template: selection.template,
    })

    return {
      exportResult,
      postfill: toPublicPostfill(postfill),
      selectedTemplateId: selection.selectedTemplateId,
      finalWarnings: reconcileWarnings({
        warnings: exportResult.warnings,
        postfill,
      }),
    }
  } catch (error) {
    return {
      exportResult,
      postfill: {
        status: "error",
        error: errorMessage(error),
      },
      finalWarnings: exportResult.warnings,
    }
  }
}
