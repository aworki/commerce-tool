import { ensureCatalogSchema } from "./schema.ts"

export type CatalogItemRow = {
  id: number
  source_site: string
  source_type: string
  source_url: string
  source_id: string
  title: string
  description: string
  images_json: string
  extra_json: string
  created_at: string
  updated_at: string
}

export type CatalogItemRecord = {
  id: number
  sourceSite: string
  sourceType: string
  sourceUrl: string
  sourceId: string
  title: string
  description: string
  images: string[]
  extra: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type CatalogItemSelectors = {
  ids?: number[]
  sourceIds?: string[]
  sourceUrls?: string[]
  categoryIds?: string[]
  categoryUrls?: string[]
}

function parseImagesJson(value: string, sourceId: string): string[] {
  const parsed = JSON.parse(value)

  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error(`catalog item ${sourceId} has invalid images_json`)
  }

  return parsed
}

function parseExtraJson(value: string, sourceId: string): Record<string, unknown> {
  const parsed = JSON.parse(value)

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`catalog item ${sourceId} has invalid extra_json`)
  }

  return parsed as Record<string, unknown>
}

function toRecord(row: CatalogItemRow): CatalogItemRecord {
  return {
    id: row.id,
    sourceSite: row.source_site,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    sourceId: row.source_id,
    title: row.title,
    description: row.description,
    images: parseImagesJson(row.images_json, row.source_id),
    extra: parseExtraJson(row.extra_json, row.source_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function nonEmpty(values: string[] | number[] | undefined) {
  return Array.isArray(values) && values.length > 0
}

export async function listCatalogItems(selectors: CatalogItemSelectors): Promise<CatalogItemRecord[]> {
  const db = await ensureCatalogSchema()
  const conditions: string[] = []
  const values: Array<string[] | number[]> = []

  if (nonEmpty(selectors.ids)) {
    values.push(selectors.ids!)
    conditions.push(`id = ANY($${values.length}::int[])`)
  }

  if (nonEmpty(selectors.sourceIds)) {
    values.push(selectors.sourceIds!)
    conditions.push(`source_id = ANY($${values.length}::text[])`)
  }

  if (nonEmpty(selectors.sourceUrls)) {
    values.push(selectors.sourceUrls!)
    conditions.push(`source_url = ANY($${values.length}::text[])`)
  }

  if (nonEmpty(selectors.categoryIds)) {
    values.push(selectors.categoryIds!)
    conditions.push(`extra_json::jsonb ->> 'category_id' = ANY($${values.length}::text[])`)
  }

  if (nonEmpty(selectors.categoryUrls)) {
    values.push(selectors.categoryUrls!)
    conditions.push(`extra_json::jsonb ->> 'category_url' = ANY($${values.length}::text[])`)
  }

  if (conditions.length === 0) {
    throw new Error("at least one catalog item selector is required")
  }

  const result = await db.query<CatalogItemRow>(`
    SELECT
      id,
      source_site,
      source_type,
      source_url,
      source_id,
      title,
      description,
      images_json,
      extra_json,
      created_at,
      updated_at
    FROM catalog_items
    WHERE ${conditions.join(" OR ")}
    ORDER BY id ASC
  `, values)

  return result.rows.map(toRecord)
}
