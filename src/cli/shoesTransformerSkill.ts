import { parseShoesTransformArgs, SHOES_TRANSFORM_USAGE } from "./parseShoesTransformArgs.ts"
import { createShoesTransformerSkill } from "../skills/shoesTransformer/shoesTransformerSkill.ts"

try {
  const input = parseShoesTransformArgs(process.argv.slice(2))
  const skill = createShoesTransformerSkill()
  const result = await skill.execute(input)

  console.log(JSON.stringify(result, null, 2))

  if (result.status === "error") {
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "unknown error")
  console.error(SHOES_TRANSFORM_USAGE)
  process.exit(1)
}
