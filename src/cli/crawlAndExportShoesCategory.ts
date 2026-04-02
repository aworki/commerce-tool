import { runShoesCategoryWorkflow } from "../skills/shoesTransformer/runShoesCategoryWorkflow.ts"

const USAGE = "Usage: bun run workflow:shoes-category-export --category-url <url> --limit <positive-number> --output <output.xlsx> [--template <template.xlsx>]"

type WorkflowArgs = {
  categoryUrl: string
  limit: number
  outputPath: string
  templatePath?: string
}

function parseArgs(argv: string[]): WorkflowArgs {
  const input: WorkflowArgs = {
    categoryUrl: "",
    limit: 0,
    outputPath: "",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]

    if (!["--category-url", "--limit", "--output", "--template"].includes(arg)) {
      throw new Error(`unknown argument: ${arg}`)
    }

    if (!value) {
      throw new Error(`missing value for ${arg}`)
    }

    if (arg === "--category-url") {
      input.categoryUrl = value
    }

    if (arg === "--limit") {
      const limit = Number(value)
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error(`invalid --limit value: ${value}`)
      }
      input.limit = limit
    }

    if (arg === "--output") {
      input.outputPath = value
    }

    if (arg === "--template") {
      input.templatePath = value
    }

    index += 1
  }

  if (!input.categoryUrl) {
    throw new Error("--category-url is required")
  }

  if (!input.limit) {
    throw new Error("--limit is required")
  }

  if (!input.outputPath) {
    throw new Error("--output is required")
  }

  return input
}

try {
  const result = await runShoesCategoryWorkflow(parseArgs(process.argv.slice(2)))
  console.log(JSON.stringify(result, null, 2))

  if (result.status === "error") {
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "unknown error")
  console.error(USAGE)
  process.exit(1)
}
