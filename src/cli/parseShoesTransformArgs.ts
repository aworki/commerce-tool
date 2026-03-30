import type { ShoesTransformInput } from "../skills/shoesTransformer/types.ts"

export const SHOES_TRANSFORM_USAGE = "Usage: bun run transform:shoes (--source-id <id> | --source-url <url> | --id <catalog-item-id> | --category-id <id> | --category-url <url>) ... --output <output.xlsx> [--template <template.xlsx>]"

export function parseShoesTransformArgs(argv: string[]): ShoesTransformInput {
  const input: ShoesTransformInput = {
    ids: [],
    sourceIds: [],
    sourceUrls: [],
    categoryIds: [],
    categoryUrls: [],
    tags: [],
    outputPath: "",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]

    if (!["--id", "--source-id", "--source-url", "--category-id", "--category-url", "--output", "--template", "--tags"].includes(arg)) {
      throw new Error(`unknown argument: ${arg}`)
    }

    if (!value) {
      throw new Error(`missing value for ${arg}`)
    }

    if (arg === "--id") {
      const id = Number(value)

      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`invalid --id value: ${value}`)
      }

      input.ids!.push(id)
    }

    if (arg === "--source-id") {
      input.sourceIds!.push(value)
    }

    if (arg === "--source-url") {
      input.sourceUrls!.push(value)
    }

    if (arg === "--category-id") {
      input.categoryIds!.push(value)
    }

    if (arg === "--category-url") {
      input.categoryUrls!.push(value)
    }

    if (arg === "--output") {
      input.outputPath = value
    }

    if (arg === "--template") {
      input.templatePath = value
    }

    if (arg === "--tags") {
      input.tags!.push(...value.split(",").map((tag) => tag.trim()).filter(Boolean))
    }

    index += 1
  }

  if (!input.outputPath) {
    throw new Error("--output is required")
  }

  if (
    input.ids!.length === 0
    && input.sourceIds!.length === 0
    && input.sourceUrls!.length === 0
    && input.categoryIds!.length === 0
    && input.categoryUrls!.length === 0
  ) {
    throw new Error("at least one selector is required: --id, --source-id, --source-url, --category-id, or --category-url")
  }

  return input
}
