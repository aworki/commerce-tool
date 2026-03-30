import type { ShoesNormalizedItem, ShoesTransformWarning } from "./types.ts"

export function validateShoesTransform(items: ShoesNormalizedItem[]): ShoesTransformWarning[] {
  return items.flatMap((item) => item.warnings)
}
