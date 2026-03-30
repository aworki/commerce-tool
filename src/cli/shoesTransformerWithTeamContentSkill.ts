import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"
import type { TeamShoesTemplateRecord } from "../db/teamShoesTemplates.ts"
import {
  formatShoesTransformUsage,
  parseShoesTransformArgs,
} from "./parseShoesTransformArgs.ts"
import { runShoesTransformerWithTeamContent } from "../skills/shoesTransformer/runShoesTransformerWithTeamContent.ts"
import type { TeamContentTemplateInput } from "../skills/shoesTransformer/validateTeamContentTemplate.ts"

const SHOES_TRANSFORM_WITH_TEAM_CONTENT_USAGE = formatShoesTransformUsage(
  "bun run skill:shoes-transformer-with-team-content",
)

function normalizeChoice(value: string): string {
  return value.trim().toLowerCase()
}

async function askYesNo(
  readline: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<boolean> {
  while (true) {
    const answer = normalizeChoice(await readline.question(prompt))

    if (answer === "" || answer === "n" || answer === "no") {
      return false
    }

    if (answer === "y" || answer === "yes") {
      return true
    }

    console.error("Please answer yes or no.")
  }
}

async function askRequiredText(
  readline: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<string> {
  while (true) {
    const answer = await readline.question(prompt)

    if (answer.trim().length > 0) {
      return answer
    }

    console.error("This value is required.")
  }
}

async function askExistingOrCreate(
  readline: ReturnType<typeof createInterface>,
  templates: TeamShoesTemplateRecord[],
): Promise<"existing" | "create"> {
  console.error("Existing team templates:")

  for (const template of templates) {
    console.error(`- ${template.id}: ${template.teamDescription}`)
  }

  while (true) {
    const answer = normalizeChoice(await readline.question("Use an existing template or create a new one? [existing/create] "))

    if (answer === "existing" || answer === "e") {
      return "existing"
    }

    if (answer === "create" || answer === "c") {
      return "create"
    }

    console.error("Please answer existing or create.")
  }
}

async function askExistingTemplateId(
  readline: ReturnType<typeof createInterface>,
  templates: TeamShoesTemplateRecord[],
): Promise<number> {
  const validIds = new Set(templates.map((template) => template.id))

  while (true) {
    const answer = await readline.question("Enter the template id to apply: ")
    const templateId = Number(answer.trim())

    if (Number.isInteger(templateId) && validIds.has(templateId)) {
      return templateId
    }

    console.error("Please enter one of the listed template ids.")
  }
}

async function collectTemplateValues(
  readline: ReturnType<typeof createInterface>,
): Promise<TeamContentTemplateInput> {
  console.error("Create a new team content template. Only {{title}} is supported as a placeholder token.")

  return {
    teamDescription: await askRequiredText(readline, "Team description: "),
    productDescriptionTemplate: await askRequiredText(readline, "商品描述 template: "),
    keyInformationTemplate: await askRequiredText(readline, "关键信息 template: "),
    seoTitleTemplate: await askRequiredText(readline, "SEO标题 template: "),
    seoDescriptionTemplate: await askRequiredText(readline, "SEO描述 template: "),
  }
}

const readline = createInterface({
  input: stdin,
  output: stdout,
})

try {
  const input = parseShoesTransformArgs(process.argv.slice(2))
  const result = await runShoesTransformerWithTeamContent({
    input,
    askShouldPostfill: async () => askYesNo(
      readline,
      "Fill 商品描述 / 关键信息 / SEO标题 / SEO描述 with team content? [y/N] ",
    ),
    chooseTemplateAction: async (templates) => askExistingOrCreate(readline, templates),
    chooseExistingTemplateId: async (templates) => askExistingTemplateId(readline, templates),
    collectTemplateValues: async () => collectTemplateValues(readline),
  })

  console.log(JSON.stringify(result, null, 2))

  if (result.exportResult.status === "error" || result.postfill.status === "error") {
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "unknown error")
  console.error(SHOES_TRANSFORM_WITH_TEAM_CONTENT_USAGE)
  process.exit(1)
} finally {
  readline.close()
}
