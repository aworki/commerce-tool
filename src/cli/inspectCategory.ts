import { inspectCategory } from "../skills/catalogIngestion/inspectCategory.ts"

const url = process.argv[2]
const limitArg = process.argv[3]
const limit = Number(limitArg ?? "0")

if (!url || !Number.isFinite(limit) || limit <= 0) {
  console.error("Usage: bun run inspect:category <category-url> <limit>")
  process.exit(1)
}

const result = await inspectCategory(url, limit)
console.log(JSON.stringify(result, null, 2))
