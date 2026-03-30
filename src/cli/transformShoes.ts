import { parseShoesTransformArgs, SHOES_TRANSFORM_USAGE } from "./parseShoesTransformArgs.ts"
import { runShoesTransform } from "../skills/shoesTransformer/runShoesTransform.ts"

try {
  const input = parseShoesTransformArgs(process.argv.slice(2))
  const result = await runShoesTransform(input)

  console.log(JSON.stringify(result, null, 2))

  if (result.status === "error") {
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "unknown error")
  console.error(SHOES_TRANSFORM_USAGE)
  process.exit(1)
}
