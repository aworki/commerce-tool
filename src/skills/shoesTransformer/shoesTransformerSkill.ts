import { runShoesTransform } from "./runShoesTransform.ts"
import type { ShoesTransformInput } from "./types.ts"

export function createShoesTransformerSkill() {
  return {
    name: "shoes-transformer",
    description: "Export already-crawled shoe catalog items from the database into the import workbook format.",
    async execute(input: ShoesTransformInput) {
      return runShoesTransform(input)
    },
  }
}
