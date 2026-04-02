---
name: catalog-ingestion
description: Use when the user wants to ingest Yupoo catalog data into the project's default PostgreSQL database. Trigger aggressively for Yupoo album URLs, Yupoo category URLs, requests to batch ingest a category, requests to inspect how many items a category may contain before ingesting, or requests to save Yupoo data into the local database. Do not accept non-Yupoo URLs or category requests without a positive limit.
---

# catalog-ingestion

## Overview
This skill is the single ingestion entrypoint for this project.

It supports only two request shapes:
1. a Yupoo album URL
2. a Yupoo category URL plus a positive limit

Everything else must be rejected clearly.

Always reuse the existing project workflows instead of reimplementing scraping or persistence logic.

## Accepted Inputs
### Album ingest
A Yupoo album URL such as:
```text
https://lol2021.x.yupoo.com/albums/225167978?uid=1&isSubCate=false
```

### Category ingest
A Yupoo category URL plus a positive limit such as:
```text
https://lol2021.x.yupoo.com/categories/4372478 50
```

## Rejected Inputs
Reject when:
- the URL is not a Yupoo URL
- the URL is Yupoo but not an album or category URL
- the user asks for category ingest without a positive limit
- the user asks for arbitrary crawling, multi-site crawling, or unsupported request shapes

## Default Environment
Database:
```text
postgres://bytedance@localhost:5432/gstack_web2skill
```

Setup command:
```bash
./setup.sh
```

## Required Project Entry Points
Use these existing commands and nothing else:
- album/category unified entry: `bun run skill:catalog <url> [limit]`
- category inspection: `bun run inspect:category <category-url> <limit>`

The business logic already lives in:
- `src/skills/catalogIngestion/catalogSkill.ts`
- `src/cli/catalogSkill.ts`
- `src/cli/inspectCategory.ts`

## Fast Path
If the user gives an album URL:
```bash
./skills/catalog-ingestion/scripts/run-catalog.sh "<album-url>"
```

If the user gives a category URL and limit:
```bash
./skills/catalog-ingestion/scripts/run-catalog.sh "<category-url>" <limit>
```

If the user wants to inspect a category before running it:
```bash
./skills/catalog-ingestion/scripts/inspect-category.sh "<category-url>" <limit>
```

## Response Pattern
When the command succeeds, show the command output directly so the user can verify:
- inserted
- updated
- skipped
- failed
- estimated category size when inspection is used

When the command is invalid, explain exactly which accepted input shape is missing.

## Quick Decision Table
| User input | Action |
|---|---|
| Yupoo album URL | Run the unified catalog script with just the URL |
| Yupoo category URL + positive limit | Optionally inspect first, then run the unified catalog script |
| Yupoo category URL without limit | Ask for a positive limit |
| Non-Yupoo URL or arbitrary crawl request | Reject |

## Template
Use `templates/request-template.md` when you need to show the user the valid request shapes.

## Example Use Cases
See `evals/evals.json` for realistic test prompts.

Representative examples:
- ingest one album from a Yupoo album URL
- inspect a Yupoo category before ingesting
- ingest the first 100 products from the high-luxury category: `https://lol2021.x.yupoo.com/categories/3779642 100`
- reject non-Yupoo URLs
- reject category requests without a positive limit

## Common Mistakes
- Treating category ingest as valid without a limit
- Accepting non-Yupoo inputs because they look similar
- Rewriting extraction logic instead of calling the project entrypoints
- Forgetting to run `./setup.sh` when Bun or PostgreSQL is missing
