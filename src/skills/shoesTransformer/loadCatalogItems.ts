import { listCatalogItems } from "../../db/catalogItems.ts"
import type { CatalogItemRecord, CatalogItemSelectors } from "../../db/catalogItems.ts"

export async function loadCatalogItems(selectors: CatalogItemSelectors): Promise<CatalogItemRecord[]> {
  const items = await listCatalogItems(selectors)

  if (items.length === 0) {
    throw new Error("no catalog items matched the provided selectors")
  }

  return items
}
