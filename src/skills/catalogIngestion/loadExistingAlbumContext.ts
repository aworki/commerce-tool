import { ensureCatalogSchema } from "../../db/schema.ts"
import type { CategoryContext, ResolvedAlbumCategoryContext } from "./types.ts"

export type PersistedAlbumCategoryContext = Omit<ResolvedAlbumCategoryContext, "storageCategoryId">

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function trimOrUndefined(value: unknown): string | undefined {
  return hasText(value) ? value.trim() : undefined
}

function toResolvedContext(categoryContext: CategoryContext): ResolvedAlbumCategoryContext {
  return {
    categoryId: categoryContext.categoryId,
    categoryTitle: categoryContext.categoryTitle,
    categoryUrl: categoryContext.categoryUrl,
    storageCategoryId: categoryContext.categoryId,
  }
}

function toPersistedContext(extraJson: string): PersistedAlbumCategoryContext | undefined {
  let parsed: unknown

  try {
    parsed = JSON.parse(extraJson)
  } catch {
    return undefined
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined
  }

  const record = parsed as Record<string, unknown>
  const categoryId = trimOrUndefined(record.category_id)

  if (!categoryId) return undefined

  return {
    categoryId,
    categoryTitle: trimOrUndefined(record.category_title),
    categoryUrl: trimOrUndefined(record.category_url),
  }
}


type CatalogExtraRow = {
  extra_json: string
}

export async function loadExistingAlbumContext(albumId: string): Promise<PersistedAlbumCategoryContext | undefined> {
  const db = await ensureCatalogSchema()
  const result = await db.query<CatalogExtraRow>(`
    SELECT extra_json
    FROM catalog_items
    WHERE source_site = 'yupoo' AND source_type = 'album' AND source_id = $1
    LIMIT 1
  `, [albumId])

  const row = result.rows[0]
  if (!row) return undefined

  return toPersistedContext(row.extra_json)
}

export async function resolveAlbumCategoryContext(args: {
  albumId: string
  inputCategoryContext?: CategoryContext
  loadExisting?: (albumId: string) => Promise<PersistedAlbumCategoryContext | undefined>
}): Promise<ResolvedAlbumCategoryContext> {
  if (args.inputCategoryContext) {
    return toResolvedContext(args.inputCategoryContext)
  }

  const existingCategoryContext = await (args.loadExisting ?? loadExistingAlbumContext)(args.albumId)
  if (!existingCategoryContext?.categoryId) {
    return { storageCategoryId: "uncategorized" }
  }

  return {
    categoryId: existingCategoryContext.categoryId,
    categoryTitle: existingCategoryContext.categoryTitle,
    categoryUrl: existingCategoryContext.categoryUrl,
    storageCategoryId: existingCategoryContext.categoryId,
  }
}
