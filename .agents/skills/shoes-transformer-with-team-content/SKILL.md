---
name: shoes-transformer-with-team-content
description: Use when the user wants to export already-crawled shoe catalog items from the local PostgreSQL database and then optionally fill 商品描述、关键信息、SEO标题、SEO描述 with a saved or newly created team template.
---

# shoes-transformer-with-team-content

## Overview
This skill is an interactive postfill wrapper over the base `shoes-transformer` export flow. It keeps the same DB selectors, workbook output, and template resolution rules.

It does not own a separate export pipeline. It first delegates workbook generation to `shoes-transformer`, which already requires DB-backed canonical OSS image URLs, and then adds the optional team-template replace/postfill step only after a successful export.

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
5. If accepted:
   - when no team templates exist, collect a new one immediately
   - otherwise choose an existing template by `id` or create a new one
   - new templates must provide five inputs and may only use the `{{title}}` placeholder token
6. Apply workbook postfill and report the final reconciled warnings.

## Required Project Entry Points
Use these existing commands and nothing else:
- base export: `bun run transform:shoes ...`
- non-interactive skill: `bun run skill:shoes-transformer ...`
- interactive wrapper skill: `bun run skill:shoes-transformer-with-team-content ...`

## Fast Path
```bash
./skills/shoes-transformer-with-team-content/scripts/run-shoes-transformer-with-team-content.sh --category-id 5057073 --output "/tmp/shoes-with-team-content.xlsx" --tags "鞋类,运动鞋,低帮鞋"
```

## Response Pattern
When the wrapper finishes, show the JSON result directly so the user can verify:
- `exportResult`
- `postfill`
- `selectedTemplateId` when a template was applied
- `finalWarnings`

## Common Mistakes
- Trying to use this wrapper to crawl new products
- Expecting the original `shoes-transformer` skill to prompt interactively
- Entering unsupported placeholder tokens other than `{{title}}`
- Writing team-content fields into every SKU row instead of only the product's first row
- Forgetting that the saved template list is chosen by `id` and labeled by `team_description`
