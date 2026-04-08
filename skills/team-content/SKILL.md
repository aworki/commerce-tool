---
name: team-content
description: Use when the user wants to export already-crawled shoe catalog items and then interactively fill 商品描述、关键信息、SEO标题、SEO描述 with a team-specific template that must be explicitly confirmed or manually provided by the user.
---

# team-content

## Overview
This skill is an interactive postfill wrapper over the base `shoes-transformer` export flow. It keeps the same DB selectors, workbook output, and template resolution rules.

It does not own a separate export pipeline. It first delegates workbook generation to `shoes-transformer`, which already requires DB-backed canonical OSS image URLs, and then adds the optional team-template replace/postfill step only after a successful export.

This skill must never invent a team name or any team template content. Team identity and all template fields must come from the user or from an already saved template that the user explicitly confirms.

Because exported products may span multiple workbook rows for multiple specs/SKUs, team-content replacement must only update the product's first row. Do not write D/G/T/U into continuation rows.

## Accepted Inputs
Use the same selectors as `shoes-transformer`:
- `--id <catalog-item-id>`
- `--source-id <yupoo-album-id>`
- `--source-url <yupoo-album-url>`
- `--category-id <category-id>`
- `--category-url <category-url>`

Required:
- `--output <output.xlsx>`

Optional:
- `--template <template.xlsx>`
- `--tags <一级类目,二级类目,三级类目>`

## Wrapper Flow
1. Run the base export with `runShoesTransformExecution(...)`.
2. If export fails, return that failure immediately.
3. If export succeeds, ask whether to fill 商品描述 / 关键信息 / SEO标题 / SEO描述.
4. If declined, keep the original warnings unchanged.
5. If accepted, ask the user to confirm the team name before any template selection or creation step.
6. After the team name is confirmed:
   - if a matching saved template exists, ask the user to explicitly choose that team template
   - if no matching template exists, tell the user that no saved template exists for that team and collect a new one immediately
7. New templates must provide five user-entered inputs and may only use the `{{title}}` placeholder token.
8. Apply workbook postfill and report the final reconciled warnings.

## Required User Confirmation Rules
- Every use of this skill must confirm the team name with the user before applying team content.
- Do not guess the team from previous conversation context, workbook content, category tags, or template descriptions.
- Do not auto-pick a template unless the user explicitly confirms that template for the stated team.
- If the team has no saved template, ask the user for all required template fields.
- Do not fabricate `teamDescription`, 商品描述模板, 关键信息模板, SEO标题模板, or SEO描述模板.
- If the user does not provide enough template information, stop and ask for it instead of improvising.

## Required Project Entry Points
Use these existing commands and nothing else:
- base export: `bun run transform:shoes ...`
- non-interactive skill: `bun run skill:shoes-transformer ...`
- interactive wrapper command: `bun run skill:shoes-transformer-with-team-content ...`

## Fast Path
```bash
./skills/team-content/scripts/run-team-content.sh --category-id 5057073 --output "/tmp/shoes-with-team-content.xlsx" --tags "鞋类,运动鞋,低帮鞋"
```

## Response Pattern
When the wrapper finishes, show the JSON result directly so the user can verify:
- `exportResult`
- `postfill`
- `selectedTemplateId` when a template was applied
- `finalWarnings`

When team confirmation or template creation is needed:
- ask for the team name first
- if no matching team template exists, say that clearly
- collect the missing template values from the user

## Common Mistakes
- Trying to use this wrapper to crawl new products
- Expecting the original `shoes-transformer` skill to prompt interactively
- Guessing the team or auto-selecting a roughly similar saved template
- Inventing template content when the team has no saved template
- Writing team-content fields into every SKU row instead of only the product's first row
- Entering unsupported placeholder tokens other than `{{title}}`
