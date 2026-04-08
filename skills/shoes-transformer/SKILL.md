---
name: shoes-transformer
description: Use when the user wants to export already-crawled shoe catalog items from the local PostgreSQL database into the shoe import workbook format, without re-crawling.
---

# shoes-transformer

## Overview
This skill is the single base export entrypoint for shoe workbooks. It exports shoe products that already exist in `catalog_items` into the Excel import template format.

It does not crawl Yupoo pages and should stay decoupled from `catalog-ingestion`. Workbook image cells must come from the canonical OSS public URLs already stored in `catalog_items.images_json`; if a row still contains legacy non-OSS image URLs, fix the data upstream instead of expecting export-time replacement.

Rows 1-4 in the workbook are fixed template/header rows and must never be modified. Export data must only append from row 5 downward.

## Accepted Inputs
Use selectors that already exist in the local database:
- `--id <catalog-item-id>`
- `--source-id <yupoo-album-id>`
- `--source-url <yupoo-album-url>`
- `--category-id <category-id>`
- `--category-url <category-url>`

Use `team-content` instead when the user wants an interactive postfill step for 商品描述 / 关键信息 / SEO标题 / SEO描述 after export.

Required:
- `--output <output.xlsx>`

Optional:
- `--template <template.xlsx>`
- `--tags <一级类目,二级类目,三级类目>`

## Rejected Inputs
Reject when:
- the request asks to crawl or scrape new data
- no DB selector is provided
- no output path is provided
- the user asks to export arbitrary non-database data

## Default Environment
Database:
```text
postgres://bytedance@localhost:5432/gstack_web2skill
```

Template to use in this repo:
```text
/Users/bytedance/Desktop/business/commerce-tool/商品导入模板.xlsx
```

Do not use:
```text
/Users/bytedance/Desktop/business/commerce-tool/模版.xlsx
```

## Required Project Entry Points
Use these existing commands and nothing else:
- direct export: `bun run transform:shoes ...`
- skill entry: `bun run skill:shoes-transformer ...`

## Fast Path
```bash
./skills/shoes-transformer/scripts/run-shoes-transformer.sh --source-id 225167978 --output "/tmp/shoes-import.xlsx" --tags "鞋类,运动鞋,低帮鞋"
```

## Response Pattern
When the command succeeds, show the JSON result directly so the user can verify:
- output path
- exported items
- exported rows
- warnings for fields left blank

When the command is invalid, explain which selector or output argument is missing.

## Common Mistakes
- Trying to use this skill to crawl new products
- Forgetting `--output`
- Forgetting to provide category tags when `L 标签` should be filled
- Modifying workbook rows 1-4 instead of only appending product rows from row 5 downward
- Expecting the skill to infer price or logistics template from the current DB schema
