---
name: run
description: Use when the user asks to run,抓取,入库,导出,补商品描述/SEO, or otherwise process commerce-tool data without clearly naming the right skill. Trigger aggressively for vague Yupoo links, ambiguous workbook export requests, and crawl-then-export requests that should be routed to catalog-ingestion, shoes-transformer, or team-content.
---

# run

## Overview
This skill is the top-level dispatcher for the commerce-tool workflows in this repo.

It does not own business logic. Its job is to identify the user's intent, ask one narrow clarification only when required, and then dispatch to the existing repo-local skills with the Skill tool.

It supports only these downstream skills:
- `catalog-ingestion`
- `shoes-transformer`
- `team-content`

Do not add a new shell wrapper or a parallel business path here.

For combined requests like “先抓再导出”, chain the existing skills in order instead of bypassing them:
1. dispatch to `catalog-ingestion`
2. after ingest succeeds, dispatch to `shoes-transformer` or `team-content`

## Accepted Inputs
Route requests in these shapes.

### 1. Ingest Yupoo data into the local database
Examples:
- a Yupoo album URL with wording like 抓取 / 入库 / 落库
- a Yupoo category URL plus a positive limit with wording like 抓前 50 条 / 入库前 100 条

### 2. Inspect a Yupoo category before ingesting
Examples:
- 先看看这个分类有多少
- 先估一下规模再抓

This still routes to `catalog-ingestion`. The downstream skill owns the inspect-vs-ingest handling.

### 3. Export already-crawled shoes from the local database
Examples:
- `--source-id <id> --output <output.xlsx>`
- `--source-url <url> --output <output.xlsx>`
- `--id <catalog-item-id> --output <output.xlsx>`
- `--category-id <id> --output <output.xlsx>`
- `--category-url <url> --output <output.xlsx>`

### 4. Export and then fill 商品描述 / 关键信息 / SEO标题 / SEO描述
Use the same selectors as the base export flow, but route here only when the user clearly wants postfill or team content.

### 5. Crawl a category and export in one request
Treat this as a chained request across existing skills.

Typical shape:
- category URL
- positive limit
- output path

Route it as:
1. `catalog-ingestion`
2. then `shoes-transformer` or `team-content`

## Rejected Inputs
Reject or narrow the request when:
- the URL is not a Yupoo URL and the user is asking to crawl or ingest
- the request is for arbitrary shell commands or unrelated repo tasks
- the request asks to export data that is not already in the local database
- a category ingest request has no positive limit
- an export request has no selector or no output path

## Routing Matrix
| Request shape | Route |
|---|---|
| Yupoo album URL + ingest intent | dispatch to `catalog-ingestion` |
| Yupoo category URL + positive limit + ingest intent | dispatch to `catalog-ingestion` |
| Category inspection intent | dispatch to `catalog-ingestion` |
| DB export only | dispatch to `shoes-transformer` |
| DB export + team content postfill | dispatch to `team-content` |
| Crawl category + export | dispatch to `catalog-ingestion`, then `shoes-transformer` |
| Crawl category + export + team content postfill | dispatch to `catalog-ingestion`, then `team-content` |
| Crawl category + export + `--tags` | dispatch to `catalog-ingestion`, then `shoes-transformer` |

## Required Project Entry Points
Use these existing downstream skills and nothing else:
- `catalog-ingestion`
- `shoes-transformer`
- `team-content`

Dispatch with the Skill tool.

Important downstream constraints that must be respected when routing:
- category ingest requires a positive limit
- base export requires one selector plus `--output`
- team-content export uses the same selector/output shape as base export
- `--tags` belong to `shoes-transformer`
- postfill belongs to `team-content`
- mixed crawl-plus-export requests should be split into two skill invocations, not pushed into a new wrapper

Relevant existing implementations:
- `skills/catalog-ingestion/SKILL.md`
- `skills/shoes-transformer/SKILL.md`
- `skills/team-content/SKILL.md`

## Clarification Rule
If the request is already specific enough, route immediately.

If the request is ambiguous, ask only one narrow question that unlocks routing.

Prefer questions like:
- 你是想先入库，还是只导出数据库里已有的数据？
- 你是只导出，还是导出后还要补团队文案？

For category inspection cases:
- if the user already made the inspect intent clear, do not re-ask intent; ask only for the missing positive limit
- ask whether to inspect first only when the category URL is present but the user has not made the ingest-vs-inspect intent clear

Do not ask for information the user already gave.

## Dispatch Rules
Once the target path is clear and the minimum required inputs are available, dispatch immediately with the Skill tool.

Dispatch targets:
- `catalog-ingestion`
- `shoes-transformer`
- `team-content`

For chained requests:
1. first invoke `catalog-ingestion`
2. only after success, invoke `shoes-transformer` or `team-content`

Do not:
- treat `run` as a generic shell executor
- add a new shell wrapper for routing
- ask extra questions after the URL, limit, selector, or output path is already present
- reimplement the underlying logic instead of routing

## Fast Path
### Ingest only
Dispatch to `catalog-ingestion`.

### Export only
Dispatch to `shoes-transformer`.

### Export with team content
Dispatch to `team-content`.

### Crawl then export
Dispatch to `catalog-ingestion`, then dispatch to the export skill that matches the user's requested output.

Use `templates/request-template.md` when you need to show supported shapes.

## Response Pattern
When routing succeeds:
- briefly state which skill path was selected
- dispatch to the existing specialized skill
- for crawl-plus-export requests, state that it will run in two steps
- show the downstream skill result directly so the user can verify inserted / updated / skipped / output path / warnings

When clarification is required:
- ask one short question
- after the answer, route without re-explaining the whole matrix

When the request is unsupported:
- say exactly which accepted shape is missing
- point to `templates/request-template.md` when examples help

## Common Mistakes
- Sending a plain Yupoo link straight into export even though the data is not in the DB yet
- Treating `run` as a separate business workflow instead of a router
- Creating a new shell wrapper instead of dispatching to existing skills
- Assuming category ingest can run without a positive limit
- Assuming export can run without a selector or output path
- Reimplementing logic instead of routing to existing skills

## Quick Examples
- “帮我跑一下这个 Yupoo album 链接” → usually ask whether the goal is 入库 or something else; if clearly入库, dispatch to `catalog-ingestion`
- “这个类目先看看规模，再抓前 50 条” → dispatch to `catalog-ingestion`
- “这个类目先看一下再跑” + no limit → ask only for a positive limit, then dispatch to `catalog-ingestion`
- “导出这个 source id 的鞋子到 xlsx” → dispatch to `shoes-transformer`
- “导出完再把商品描述和 SEO 一起补上” → dispatch to `team-content`
- “抓这个分类前 100 条并导出到 xlsx” → dispatch to `catalog-ingestion` first, then `shoes-transformer`
- “抓这个分类前 100 条并导出，再补团队文案” → dispatch to `catalog-ingestion` first, then `team-content`
- “抓一下淘宝链接然后导出” → reject as unsupported
