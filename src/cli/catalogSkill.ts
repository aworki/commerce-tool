import { createCatalogIngestionSkill } from "../skills/catalogIngestion/catalogSkill.ts"

const url = process.argv[2]
const limitArg = process.argv[3]
const limit = limitArg ? Number(limitArg) : undefined

if (!url) {
  console.error("Usage: bun run skill:catalog <yupoo-album-or-category-url> [limit-for-category]")
  process.exit(1)
}

const skill = createCatalogIngestionSkill()
const result = await skill.execute({ url, limit })

console.log(JSON.stringify(result, null, 2))

if (result.status === "error") {
  process.exit(1)
}
