# Shoes Team Content Postfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add team-scoped shoe-content templates plus an interactive wrapper skill so shoe exports can optionally fill workbook columns `D/G/T/U` with team-specific text after export.

**Architecture:** Keep the existing `shoes-transformer` Bun/CLI paths non-interactive. Add one internal export-execution layer that returns both the current public export result and a deterministic postfill manifest, then build a focused workbook-postfill module plus a new wrapper Claude skill that orchestrates export, user confirmation, team-template selection/creation, and warning reconciliation.

**Tech Stack:** Bun test runner, TypeScript, PostgreSQL (`pg`), ExcelJS, existing shoe-transformer CLI/skill structure under `src/`, `.claude/skills/`, and `skills/`

---

## File Structure

### Files to modify
- `package.json` — add a script entry for the new wrapper skill CLI if the implementation exposes one.
- `src/db/schema.ts` — extend schema bootstrap with the new `team_shoes_content_templates` table.
- `src/cli/parseShoesTransformArgs.ts` — export reusable selector/output parsing for the wrapper entrypoint without changing current CLI behavior.
- `src/skills/shoesTransformer/types.ts` — add warning-kind metadata plus internal execution/manifest/postfill result types.
- `src/skills/shoesTransformer/normalizeCatalogItemForShoes.ts` — emit machine-readable warning kinds for manual-fill and existing validation warnings.
- `src/skills/shoesTransformer/runShoesTransform.ts` — delegate to the new internal execution layer while preserving the public `ShoesTransformResult` contract.
- `src/skills/shoesTransformer/writeShoesWorkbook.test.ts` — keep workbook-template helpers aligned with postfill tests if helper extraction is needed.
- `.claude/skills/shoes-transformer/SKILL.md` — update accepted selectors so the skill docs match the actual parser (`--category-id`, `--category-url`).
- `.claude/settings.local.json` — add copy/chmod hooks for the new wrapper skill so `.claude/skills/...` mirrors into `skills/...` and `.agents/...`.

### Files to create
- `src/db/teamShoesTemplates.ts` — CRUD access for team template records.
- `src/db/teamShoesTemplates.test.ts` — tests for schema-backed template creation/list/load.
- `src/skills/shoesTransformer/runShoesTransformExecution.ts` — internal export execution that returns `{ publicResult, manifest }`.
- `src/skills/shoesTransformer/runShoesTransformExecution.test.ts` — tests for manifest row numbering and public-result preservation.
- `src/skills/shoesTransformer/validateTeamContentTemplate.ts` — trim/reject rules for `team_description`, blank templates, and unsupported `{{...}}` tokens.
- `src/skills/shoesTransformer/validateTeamContentTemplate.test.ts` — tests for placeholder parsing and rejection behavior.
- `src/skills/shoesTransformer/applyTeamContentPostfill.ts` — open workbook, write `D/G/T/U` for first rows only, return per-product postfill results.
- `src/skills/shoesTransformer/applyTeamContentPostfill.test.ts` — workbook-level tests for first-row-only writes and all-or-nothing per-product behavior.
- `src/skills/shoesTransformer/reconcilePostfillWarnings.ts` — remove only successful `D/G/T/U` manual-fill warnings while preserving everything else.
- `src/skills/shoesTransformer/reconcilePostfillWarnings.test.ts` — tests for warning filtering rules.
- `src/skills/shoesTransformer/runShoesTransformerWithTeamContent.ts` — orchestration entrypoint for the wrapper skill.
- `src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts` — orchestration tests for skip/apply/error paths.
- `src/cli/shoesTransformerWithTeamContentSkill.ts` — wrapper CLI entrypoint used by the new Claude skill.
- `.claude/skills/shoes-transformer-with-team-content/SKILL.md` — new user-facing Claude skill that documents the wrapper flow.
- `.claude/skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh` — script entry for the new wrapper skill.
- `skills/shoes-transformer-with-team-content/SKILL.md` — mirrored generated skill doc kept in-repo.
- `skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh` — mirrored generated wrapper script kept in-repo.
- `.agents/skills/shoes-transformer-with-team-content/SKILL.md` — mirrored agent copy if the repo continues checking in agent skill mirrors.
- `.agents/skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh` — mirrored agent script copy.

### Files intentionally left alone
- `src/skills/shoesTransformer/buildWorkbookRows.ts` — keep base row generation focused on export rows, not postfill concerns.
- `src/skills/shoesTransformer/writeShoesWorkbook.ts` — keep the base workbook writer responsible only for first-pass export output.
- `src/cli/transformShoes.ts` — preserve the direct non-interactive export entrypoint.
- `src/cli/shoesTransformerSkill.ts` — preserve the existing JSON-once skill CLI entrypoint.

## Task 1: Add team-template persistence and validation contracts

**Files:**
- Create: `src/db/teamShoesTemplates.ts`
- Create: `src/db/teamShoesTemplates.test.ts`
- Create: `src/skills/shoesTransformer/validateTeamContentTemplate.ts`
- Create: `src/skills/shoesTransformer/validateTeamContentTemplate.test.ts`
- Modify: `src/db/schema.ts`
- Test: `src/db/teamShoesTemplates.test.ts`
- Test: `src/skills/shoesTransformer/validateTeamContentTemplate.test.ts`

- [ ] **Step 1: Write the failing team-template validation tests**

```ts
import { describe, expect, test } from "bun:test"
import { validateTeamContentTemplateInput } from "./validateTeamContentTemplate"

describe("validateTeamContentTemplateInput", () => {
  test("trims fields and accepts plain text plus exact {{title}}", () => {
    expect(validateTeamContentTemplateInput({
      teamDescription: "  Jordan 团队  ",
      productDescriptionTemplate: "  {{title}} 现货  ",
      keyInformationTemplate: "货号: {{title}}",
      seoTitleTemplate: "{{title}} 官网同款",
      seoDescriptionTemplate: "精选 {{title}}",
    })).toEqual({
      teamDescription: "Jordan 团队",
      productDescriptionTemplate: "{{title}} 现货",
      keyInformationTemplate: "货号: {{title}}",
      seoTitleTemplate: "{{title}} 官网同款",
      seoDescriptionTemplate: "精选 {{title}}",
    })
  })

  test("rejects empty team description after trimming", () => {
    expect(() => validateTeamContentTemplateInput({
      teamDescription: "   ",
      productDescriptionTemplate: "A",
      keyInformationTemplate: "B",
      seoTitleTemplate: "C",
      seoDescriptionTemplate: "D",
    })).toThrow("team_description is required")
  })

  test("rejects empty template fields after trimming", () => {
    expect(() => validateTeamContentTemplateInput({
      teamDescription: "Nike",
      productDescriptionTemplate: "   ",
      keyInformationTemplate: "B",
      seoTitleTemplate: "C",
      seoDescriptionTemplate: "D",
    })).toThrow("template fields are required")
  })

  test("rejects unsupported placeholder tokens", () => {
    expect(() => validateTeamContentTemplateInput({
      teamDescription: "Nike",
      productDescriptionTemplate: "{{ title }}",
      keyInformationTemplate: "{{team}}",
      seoTitleTemplate: "{{title}}",
      seoDescriptionTemplate: "plain",
    })).toThrow("unsupported placeholder")
  })
})
```
'},
- [ ] **Step 2: Run the validation suite and confirm it fails**

Run: `bun test src/skills/shoesTransformer/validateTeamContentTemplate.test.ts`
Expected: FAIL with missing file/export errors.

- [ ] **Step 3: Write the failing persistence tests for create/list/load**

```ts
import { beforeEach, describe, expect, test } from "bun:test"
import {
  createTeamShoesTemplate,
  getTeamShoesTemplateById,
  listTeamShoesTemplates,
} from "./teamShoesTemplates"

beforeEach(async () => {
  // truncate team_shoes_content_templates and ensure schema exists
})

describe("teamShoesTemplates", () => {
  test("creates and reloads a template row", async () => {
    const created = await createTeamShoesTemplate({
      teamDescription: "Jordan 团队",
      productDescriptionTemplate: "{{title}} 现货",
      keyInformationTemplate: "货号 {{title}}",
      seoTitleTemplate: "{{title}} 官网同款",
      seoDescriptionTemplate: "精选 {{title}}",
    })

    const loaded = await getTeamShoesTemplateById(created.id)
    expect(loaded?.teamDescription).toBe("Jordan 团队")
    expect(loaded?.seoTitleTemplate).toBe("{{title}} 官网同款")
  })

  test("lists templates newest-first or id-desc for operator selection", async () => {
    await createTeamShoesTemplate({ ...firstTemplate })
    await createTeamShoesTemplate({ ...secondTemplate })

    const listed = await listTeamShoesTemplates()
    expect(listed.map((entry) => entry.teamDescription)).toEqual(["second", "first"])
  })
})
```

- [ ] **Step 4: Run the persistence suite and confirm it fails**

Run: `bun test src/db/teamShoesTemplates.test.ts`
Expected: FAIL with missing file/table errors.

- [ ] **Step 5: Extend schema bootstrap for the new table**

```ts
await db.query(`
  CREATE TABLE IF NOT EXISTS team_shoes_content_templates (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    team_description TEXT NOT NULL,
    product_description_template TEXT NOT NULL,
    key_information_template TEXT NOT NULL,
    seo_title_template TEXT NOT NULL,
    seo_description_template TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`)
```

- [ ] **Step 6: Implement the typed DB module**

```ts
export async function createTeamShoesTemplate(input: TeamShoesTemplateInput) {
  const db = await ensureCatalogSchema()
  const result = await db.query<TeamShoesTemplateRow>(`
    INSERT INTO team_shoes_content_templates (
      team_description,
      product_description_template,
      key_information_template,
      seo_title_template,
      seo_description_template
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, team_description, product_description_template,
              key_information_template, seo_title_template,
              seo_description_template, created_at, updated_at
  `, [
    input.teamDescription,
    input.productDescriptionTemplate,
    input.keyInformationTemplate,
    input.seoTitleTemplate,
    input.seoDescriptionTemplate,
  ])

  return toTemplateRecord(result.rows[0])
}
```

- [ ] **Step 7: Implement the validation helper with exact placeholder parsing**

```ts
const PLACEHOLDER_TOKEN = /\{\{[^{}]+\}\}/g

export function validateTeamContentTemplateInput(input: TeamContentTemplateInput) {
  const trimmed = {
    teamDescription: input.teamDescription.trim(),
    productDescriptionTemplate: input.productDescriptionTemplate.trim(),
    keyInformationTemplate: input.keyInformationTemplate.trim(),
    seoTitleTemplate: input.seoTitleTemplate.trim(),
    seoDescriptionTemplate: input.seoDescriptionTemplate.trim(),
  }

  if (!trimmed.teamDescription) {
    throw new Error("team_description is required")
  }

  const templateValues = [
    trimmed.productDescriptionTemplate,
    trimmed.keyInformationTemplate,
    trimmed.seoTitleTemplate,
    trimmed.seoDescriptionTemplate,
  ]

  if (templateValues.some((value) => value === "")) {
    throw new Error("template fields are required")
  }

  for (const value of templateValues) {
    for (const token of value.match(PLACEHOLDER_TOKEN) ?? []) {
      if (token !== "{{title}}") {
        throw new Error(`unsupported placeholder: ${token}`)
      }
    }
  }

  return trimmed
}
```

- [ ] **Step 8: Run the focused validation and persistence suites**

Run: `bun test src/skills/shoesTransformer/validateTeamContentTemplate.test.ts src/db/teamShoesTemplates.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/db/teamShoesTemplates.ts src/db/teamShoesTemplates.test.ts src/skills/shoesTransformer/validateTeamContentTemplate.ts src/skills/shoesTransformer/validateTeamContentTemplate.test.ts
git commit -m "feat: add shoe team content template storage"
```

## Task 2: Add internal export execution, warning kinds, and deterministic manifest output

**Files:**
- Create: `src/skills/shoesTransformer/runShoesTransformExecution.ts`
- Create: `src/skills/shoesTransformer/runShoesTransformExecution.test.ts`
- Modify: `src/skills/shoesTransformer/types.ts`
- Modify: `src/skills/shoesTransformer/normalizeCatalogItemForShoes.ts`
- Modify: `src/skills/shoesTransformer/runShoesTransform.ts`
- Modify: `src/skills/shoesTransformer/normalizeCatalogItemForShoes.test.ts`
- Modify: `src/skills/shoesTransformer/runShoesTransform.test.ts`
- Test: `src/skills/shoesTransformer/runShoesTransformExecution.test.ts`
- Test: `src/skills/shoesTransformer/normalizeCatalogItemForShoes.test.ts`
- Test: `src/skills/shoesTransformer/runShoesTransform.test.ts`

- [ ] **Step 1: Write the failing manifest and warning-kind tests**

```ts
import { describe, expect, test } from "bun:test"
import { buildShoesTransformExecution } from "./runShoesTransformExecution"

describe("buildShoesTransformExecution", () => {
  test("returns first-row numbers for each normalized product", async () => {
    const execution = await buildShoesTransformExecution({
      ids: [101, 102],
      outputPath: "/tmp/out.xlsx",
      templatePath: "/tmp/template.xlsx",
      loadItems: async () => [firstItem, secondItem],
      writeWorkbook: async () => undefined,
    })

    expect(execution.manifest).toEqual([
      {
        catalogItemId: 101,
        sourceSite: "yupoo",
        sourceType: "album",
        sourceId: "225167978",
        workbookTitle: "Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
        firstRowNumber: 5,
      },
      {
        catalogItemId: 102,
        sourceSite: "yupoo",
        sourceType: "album",
        sourceId: "225167979",
        workbookTitle: "Air Jordan 4 Retro 'Bred Reimagined'",
        firstRowNumber: 7,
      },
    ])
  })
})
```

```ts
expect(normalized.warnings).toContainEqual({
  sourceId: item.sourceId,
  field: "D",
  kind: "manual_blank",
  message: "商品描述按当前规则留空",
})
```

- [ ] **Step 2: Run the execution-focused tests and confirm they fail**

Run: `bun test src/skills/shoesTransformer/runShoesTransformExecution.test.ts src/skills/shoesTransformer/runShoesTransform.test.ts src/skills/shoesTransformer/normalizeCatalogItemForShoes.test.ts`
Expected: FAIL with missing file/type mismatches.

- [ ] **Step 3: Extend the shoe-transform types**

```ts
export type ShoesWarningKind = "manual_blank" | "missing_cover" | "missing_sizes"

export type ShoesTransformWarning = {
  sourceId: string
  field: string
  kind: ShoesWarningKind
  message: string
}

export type ShoesPostfillManifestEntry = {
  catalogItemId: number
  sourceSite: string
  sourceType: string
  sourceId: string
  workbookTitle: string
  firstRowNumber: number
}

export type ShoesTransformExecution = {
  publicResult: ShoesTransformResult
  manifest: ShoesPostfillManifestEntry[]
}
```

- [ ] **Step 4: Add machine-readable warning kinds in normalization**

```ts
function createWarning(sourceId: string, field: string, kind: ShoesWarningKind, message: string): ShoesTransformWarning {
  return { sourceId, field, kind, message }
}

warnings.push(
  createWarning(item.sourceId, "D", "manual_blank", "商品描述按当前规则留空"),
  createWarning(item.sourceId, "G", "manual_blank", "关键信息按当前规则留空"),
  createWarning(item.sourceId, "T", "manual_blank", "SEO 标题按当前规则留空"),
  createWarning(item.sourceId, "U", "manual_blank", "SEO 描述按当前规则留空"),
)
```

- [ ] **Step 5: Implement the internal execution builder**

```ts
export async function runShoesTransformExecution(input: ShoesTransformInput): Promise<ShoesTransformExecution> {
  const items = await loadCatalogItems(...)
  const normalizedItems = items.map(...)
  const rows = normalizedItems.flatMap(buildWorkbookRows)

  await writeShoesWorkbook({ ... })

  let nextRowNumber = 5
  const manifest = normalizedItems.map((normalized) => {
    const firstRowNumber = nextRowNumber
    nextRowNumber += Math.max(buildWorkbookRows(normalized).length, 1)

    return {
      catalogItemId: normalized.item.id,
      sourceSite: normalized.item.sourceSite,
      sourceType: normalized.item.sourceType,
      sourceId: normalized.item.sourceId,
      workbookTitle: normalized.cleanTitle,
      firstRowNumber,
    }
  })

  return {
    publicResult: {
      status: "success",
      outputPath: input.outputPath,
      exportedItems: normalizedItems.length,
      exportedRows: rows.length,
      warnings: validateShoesTransform(normalizedItems),
    },
    manifest,
  }
}
```

- [ ] **Step 6: Make the public runner delegate without changing output shape**

```ts
export async function runShoesTransform(input: ShoesTransformInput): Promise<ShoesTransformResult> {
  try {
    const execution = await runShoesTransformExecution(input)
    return execution.publicResult
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
```

- [ ] **Step 7: Run the execution and warning suites**

Run: `bun test src/skills/shoesTransformer/runShoesTransformExecution.test.ts src/skills/shoesTransformer/runShoesTransform.test.ts src/skills/shoesTransformer/normalizeCatalogItemForShoes.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/skills/shoesTransformer/types.ts src/skills/shoesTransformer/normalizeCatalogItemForShoes.ts src/skills/shoesTransformer/normalizeCatalogItemForShoes.test.ts src/skills/shoesTransformer/runShoesTransformExecution.ts src/skills/shoesTransformer/runShoesTransformExecution.test.ts src/skills/shoesTransformer/runShoesTransform.ts src/skills/shoesTransformer/runShoesTransform.test.ts
git commit -m "feat: add shoe export execution manifest"
```

## Task 3: Implement workbook postfill and warning reconciliation

**Files:**
- Create: `src/skills/shoesTransformer/applyTeamContentPostfill.ts`
- Create: `src/skills/shoesTransformer/applyTeamContentPostfill.test.ts`
- Create: `src/skills/shoesTransformer/reconcilePostfillWarnings.ts`
- Create: `src/skills/shoesTransformer/reconcilePostfillWarnings.test.ts`
- Test: `src/skills/shoesTransformer/applyTeamContentPostfill.test.ts`
- Test: `src/skills/shoesTransformer/reconcilePostfillWarnings.test.ts`
- Test: `src/skills/shoesTransformer/writeShoesWorkbook.test.ts`

- [ ] **Step 1: Write the failing workbook-postfill tests**

```ts
import { describe, expect, test } from "bun:test"
import ExcelJS from "exceljs"
import { applyTeamContentPostfill } from "./applyTeamContentPostfill"

describe("applyTeamContentPostfill", () => {
  test("writes D/G/T/U on first rows only", async () => {
    const result = await applyTeamContentPostfill({
      workbookPath,
      manifest: [
        {
          catalogItemId: 101,
          sourceSite: "yupoo",
          sourceType: "album",
          sourceId: "225167978",
          workbookTitle: "Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'",
          firstRowNumber: 5,
        },
      ],
      template: {
        id: 9,
        teamDescription: "Jordan",
        productDescriptionTemplate: "{{title}} 现货",
        keyInformationTemplate: "货号 {{title}}",
        seoTitleTemplate: "{{title}} 官网同款",
        seoDescriptionTemplate: "精选 {{title}}",
      },
    })

    expect(result.productsUpdated).toBe(1)
    expect(sheet.getCell("D5").value).toBe("Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink' 现货")
    expect(sheet.getCell("G5").value).toBe("货号 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'")
    expect(sheet.getCell("T5").value).toBe("Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink' 官网同款")
    expect(sheet.getCell("U5").value).toBe("精选 Travis Scott x Air Jordan 1 Retro Low OG 'Muslin Pink'")
    expect(sheet.getCell("D6").value).toBeNull()
  })

  test("leaves all four cells untouched when any generated field is blank", async () => {
    // seoDescriptionTemplate = "   " after replacement/trim should fail the product
  })

  test("returns a per-product error when the manifest row cannot be located", async () => {
    // firstRowNumber points beyond the written product rows; expect no cells written and a row_not_found result
  })
})
```

- [ ] **Step 2: Run the workbook-postfill suite and confirm it fails**

Run: `bun test src/skills/shoesTransformer/applyTeamContentPostfill.test.ts src/skills/shoesTransformer/reconcilePostfillWarnings.test.ts`
Expected: FAIL with missing file/export errors.

- [ ] **Step 3: Implement workbook postfill with all-or-nothing per-product writes**

```ts
const TARGET_COLUMNS = {
  productDescription: "D",
  keyInformation: "G",
  seoTitle: "T",
  seoDescription: "U",
} as const

export async function applyTeamContentPostfill(input: ApplyTeamContentPostfillInput) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(input.workbookPath)

  const sheet = workbook.getWorksheet("商品信息")
  if (!sheet) throw new Error("template workbook is missing the 商品信息 sheet")

  const results = input.manifest.map((entry) => {
    const generated = renderTemplateSet(input.template, entry.workbookTitle)
    if (Object.values(generated).some((value) => value.trim() === "")) {
      return { entry, status: "skipped", reason: "blank_generated_value" }
    }

    const row = sheet.getRow(entry.firstRowNumber)
    if (!row || row.number !== entry.firstRowNumber || row.getCell("B").value == null) {
      return { entry, status: "skipped", reason: "row_not_found" }
    }

    row.getCell("D").value = generated.productDescription
    row.getCell("G").value = generated.keyInformation
    row.getCell("T").value = generated.seoTitle
    row.getCell("U").value = generated.seoDescription

    return { entry, status: "updated" }
  })

  await workbook.xlsx.writeFile(input.workbookPath)
  return summarizePostfillResults(results)
}
```

- [ ] **Step 4: Implement warning reconciliation against machine-readable kinds**

```ts
export function reconcilePostfillWarnings(input: {
  warnings: ShoesTransformWarning[]
  updatedSourceIds: Set<string>
}) {
  return input.warnings.filter((warning) => {
    if (warning.kind !== "manual_blank") return true
    if (!["D", "G", "T", "U"].includes(warning.field)) return true
    return !input.updatedSourceIds.has(warning.sourceId)
  })
}
```

- [ ] **Step 5: Add hard-stop and per-product failure tests**

```ts
test("keeps original warnings unchanged when 商品信息 sheet is missing", async () => {
  await expect(applyTeamContentPostfill({ workbookPath: missingSheetWorkbook, ... })).rejects.toThrow(
    "template workbook is missing the 商品信息 sheet",
  )
})

test("reports row_not_found and keeps the product unchanged when the manifest row is missing", async () => {
  const result = await applyTeamContentPostfill({
    workbookPath,
    manifest: [{ ...entry, firstRowNumber: 999 }],
    template,
  })

  expect(result.updatedSourceIds.size).toBe(0)
  expect(result.warnings).toContainEqual({ sourceId: entry.sourceId, reason: "row_not_found" })
  expect(sheet.getCell("D5").value).toBeNull()
  expect(sheet.getCell("G5").value).toBeNull()
  expect(sheet.getCell("T5").value).toBeNull()
  expect(sheet.getCell("U5").value).toBeNull()
})

test("keeps original warnings unchanged when workbook save fails", async () => {
  await expect(applyTeamContentPostfill({
    workbookPath,
    manifest,
    template,
    writeWorkbook: async () => {
      throw new Error("write failed")
    },
  })).rejects.toThrow("write failed")
})

test("removes only D/G/T/U manual_blank warnings for updated products", () => {
  expect(reconcilePostfillWarnings({
    warnings,
    updatedSourceIds: new Set(["225167978"]),
  })).toEqual([
    { sourceId: "225167978", field: "J", kind: "manual_blank", message: "物流模板按当前规则留空" },
    { sourceId: "225167978", field: "AD", kind: "manual_blank", message: "售价按当前规则留空" },
    { sourceId: "225167979", field: "D", kind: "manual_blank", message: "商品描述按当前规则留空" },
  ])
})
```

- [ ] **Step 6: Run the focused postfill suites**

Run: `bun test src/skills/shoesTransformer/applyTeamContentPostfill.test.ts src/skills/shoesTransformer/reconcilePostfillWarnings.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/skills/shoesTransformer/applyTeamContentPostfill.ts src/skills/shoesTransformer/applyTeamContentPostfill.test.ts src/skills/shoesTransformer/reconcilePostfillWarnings.ts src/skills/shoesTransformer/reconcilePostfillWarnings.test.ts
git commit -m "feat: add shoe workbook postfill flow"
```

## Task 4: Wire the interactive wrapper skill and keep existing skill docs in sync

**Files:**
- Create: `src/skills/shoesTransformer/runShoesTransformerWithTeamContent.ts`
- Create: `src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts`
- Create: `src/cli/shoesTransformerWithTeamContentSkill.ts`
- Create: `.claude/skills/shoes-transformer-with-team-content/SKILL.md`
- Create: `.claude/skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh`
- Create: `skills/shoes-transformer-with-team-content/SKILL.md`
- Create: `skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh`
- Create: `.agents/skills/shoes-transformer-with-team-content/SKILL.md`
- Create: `.agents/skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh`
- Modify: `package.json`
- Modify: `src/cli/parseShoesTransformArgs.ts`
- Modify: `.claude/skills/shoes-transformer/SKILL.md`
- Modify: `.claude/settings.local.json`
- Test: `src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts`

- [ ] **Step 1: Write the failing wrapper-orchestration tests**

```ts
import { describe, expect, test } from "bun:test"
import { runShoesTransformerWithTeamContent } from "./runShoesTransformerWithTeamContent"

describe("runShoesTransformerWithTeamContent", () => {
  test("returns the base export result unchanged when postfill is declined", async () => {
    const result = await runShoesTransformerWithTeamContent({
      input,
      askShouldPostfill: async () => false,
      runExecution: async () => execution,
    })

    expect(result.postfill.status).toBe("skipped")
    expect(result.finalWarnings).toEqual(execution.publicResult.warnings)
  })

  test("selects an existing template by id and applies postfill", async () => {
    const result = await runShoesTransformerWithTeamContent({
      input,
      askShouldPostfill: async () => true,
      listTemplates: async () => [existingTemplate],
      chooseExistingOrCreate: async () => ({ type: "existing", templateId: existingTemplate.id }),
      loadTemplate: async () => existingTemplate,
      runExecution: async () => execution,
      applyPostfill: async () => ({ productsUpdated: 1, updatedSourceIds: new Set(["225167978"]), warnings: [] }),
    })

    expect(result.selectedTemplateId).toBe(existingTemplate.id)
    expect(result.finalWarnings.some((warning) => warning.field === "D" && warning.sourceId === "225167978")).toBe(false)
  })

  test("routes empty-state directly into create flow", async () => {
    const result = await runShoesTransformerWithTeamContent({
      input,
      askShouldPostfill: async () => true,
      listTemplates: async () => [],
      chooseExistingOrCreate: async () => ({ type: "create", values: createInput }),
      createTemplate: async () => createdTemplate,
      runExecution: async () => execution,
      applyPostfill: async () => ({ productsUpdated: 1, updatedSourceIds: new Set(["225167978"]), warnings: [] }),
    })

    expect(result.selectedTemplateId).toBe(createdTemplate.id)
    expect(result.postfill.status).toBe("applied")
  })
})
```

- [ ] **Step 2: Run the wrapper suite and confirm it fails**

Run: `bun test src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts`
Expected: FAIL with missing file/export errors.

- [ ] **Step 3: Implement the wrapper orchestration module**

```ts
export async function runShoesTransformerWithTeamContent(input: ShoesTransformInput) {
  const execution = await runShoesTransformExecution(input)

  if (execution.publicResult.status === "error") {
    return {
      exportResult: execution.publicResult,
      postfill: { status: "skipped" },
      finalWarnings: execution.publicResult.warnings,
    }
  }

  const shouldPostfill = await askUserQuestion(...)
  if (!shouldPostfill) {
    return {
      exportResult: execution.publicResult,
      postfill: { status: "skipped" },
      finalWarnings: execution.publicResult.warnings,
    }
  }

  const templates = await listTeamShoesTemplates()
  const selection = templates.length === 0
    ? { type: "create", values: await collectTemplateValues() }
    : await chooseExistingOrCreate(templates)

  const template = selection.type === "existing"
    ? await getTeamShoesTemplateById(selection.templateId)
    : await createTeamShoesTemplate(validateTeamContentTemplateInput(selection.values))

  // apply workbook postfill, then reconcile warnings from execution.publicResult.warnings
}
```

- [ ] **Step 4: Expose a wrapper CLI/script and update skill docs**

```json
{
  "scripts": {
    "skill:shoes-transformer-with-team-content": "bun run src/cli/shoesTransformerWithTeamContentSkill.ts"
  }
}
```

```md
## Accepted Inputs
- `--id <catalog-item-id>`
- `--source-id <yupoo-album-id>`
- `--source-url <yupoo-album-url>`
- `--category-id <category-id>`
- `--category-url <category-url>`
```

- [ ] **Step 5: Add the hook-copy rules for the new skill mirror files**

```json
"Bash(cp -f \"/Users/bytedance/Desktop/business/gstack-e-commerce-tool/.claude/skills/shoes-transformer-with-team-content/SKILL.md\" \"/Users/bytedance/Desktop/business/gstack-e-commerce-tool/skills/shoes-transformer-with-team-content/SKILL.md\")",
"Bash(cp -f \"/Users/bytedance/Desktop/business/gstack-e-commerce-tool/.claude/skills/shoes-transformer-with-team-content/SKILL.md\" \"/Users/bytedance/Desktop/business/gstack-e-commerce-tool/.agents/skills/shoes-transformer-with-team-content/SKILL.md\")"
```

- [ ] **Step 6: Run the wrapper suite**

Run: `bun test src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts`
Expected: PASS.

- [ ] **Step 7: Smoke-test the public entrypoints and docs sync**

Run: `bun test src/skills/shoesTransformer/runShoesTransformExecution.test.ts src/skills/shoesTransformer/applyTeamContentPostfill.test.ts src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts`
Expected: PASS.

Run: `bun run src/cli/shoesTransformerSkill.ts --category-id 5057073 --output /tmp/shoes.xlsx`
Expected: prints one JSON result and exits without prompting.

Run: `bun run src/cli/shoesTransformerWithTeamContentSkill.ts --category-id 5057073 --output /tmp/shoes-with-team.xlsx`
Expected: returns wrapper-flow output for the interactive skill harness or fails cleanly when invoked without the wrapper's prompt adapters.

- [ ] **Step 8: Commit**

```bash
git add package.json src/cli/parseShoesTransformArgs.ts src/cli/shoesTransformerWithTeamContentSkill.ts src/skills/shoesTransformer/runShoesTransformerWithTeamContent.ts src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts .claude/skills/shoes-transformer/SKILL.md .claude/skills/shoes-transformer-with-team-content/SKILL.md .claude/skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh skills/shoes-transformer-with-team-content/SKILL.md skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh .agents/skills/shoes-transformer-with-team-content/SKILL.md .agents/skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh .claude/settings.local.json
git commit -m "feat: add interactive shoe team content wrapper"
```

## Task 5: Run the full verification pass and document expected operator checks

**Files:**
- Modify: `docs/superpowers/plans/2026-03-30-shoes-team-content-postfill.md`
- Test: `src/db/teamShoesTemplates.test.ts`
- Test: `src/skills/shoesTransformer/validateTeamContentTemplate.test.ts`
- Test: `src/skills/shoesTransformer/runShoesTransformExecution.test.ts`
- Test: `src/skills/shoesTransformer/applyTeamContentPostfill.test.ts`
- Test: `src/skills/shoesTransformer/reconcilePostfillWarnings.test.ts`
- Test: `src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts`

- [ ] **Step 1: Run the targeted shoes team-content suites**

Run: `bun test src/db/teamShoesTemplates.test.ts src/skills/shoesTransformer/validateTeamContentTemplate.test.ts src/skills/shoesTransformer/runShoesTransformExecution.test.ts src/skills/shoesTransformer/applyTeamContentPostfill.test.ts src/skills/shoesTransformer/reconcilePostfillWarnings.test.ts src/skills/shoesTransformer/runShoesTransformerWithTeamContent.test.ts`
Expected: PASS.

- [ ] **Step 2: Run the broader shoes-transformer regression suites**

Run: `bun test src/skills/shoesTransformer`
Expected: PASS.

- [ ] **Step 3: Record the manual operator smoke checks in the plan before execution handoff**

```md
Manual smoke checks:
- Export with `bun run skill:shoes-transformer --source-id ... --output ...` and confirm the process prints one JSON payload and exits.
- Run the new wrapper skill through Claude, decline postfill, and confirm the workbook still has blank `D/G/T/U` plus the original warnings.
- Run the wrapper skill again, create a new team template, and confirm `D/G/T/U` are filled on row 5/first rows only.
- Re-run with an existing team template and confirm the template list shows non-empty `team_description` labels.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-03-30-shoes-team-content-postfill.md
git commit -m "docs: finalize shoes team content rollout plan"
```
