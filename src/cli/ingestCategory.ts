import { ingestCategory } from "../skills/catalogIngestion/ingestCategory.ts"

const url = process.argv[2]
const limitArg = process.argv[3]
const limit = Number(limitArg ?? "0")

if (!url || !Number.isFinite(limit) || limit <= 0) {
  console.error("Usage: bun run ingest:category <category-url> <limit>")
  process.exit(1)
}

const result = await ingestCategory(url, limit)
console.log(JSON.stringify(result, null, 2))

if (result.status === "error") {
  process.exit(1)
}
