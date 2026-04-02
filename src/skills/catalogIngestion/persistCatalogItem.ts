import { createHash } from "node:crypto"
import { ensureCatalogSchema } from "../../db/schema.ts"
import type { CatalogItem, PersistResult } from "./types.ts"

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort())
}

function contentHashFor(item: CatalogItem): string {
  return createHash("sha256")
    .update(JSON.stringify({
      title: item.title,
      description: item.description,
      images: item.images,
      extra: item.extra,
    }))
    .digest("hex")
}

export async function persistCatalogItem(item: CatalogItem): Promise<PersistResult> {
  const db = await ensureCatalogSchema()
  const imagesJson = JSON.stringify(item.images)
  const extraJson = stableJson(item.extra)
  const contentHash = contentHashFor(item)

  const existingResult = await db.query<{
    id: number
    content_hash: string
  }>(`
    SELECT id, content_hash
    FROM catalog_items
    WHERE source_site = $1 AND source_type = $2 AND source_id = $3
  `, [item.sourceSite, item.sourceType, item.sourceId])

  const existing = existingResult.rows[0]

  if (!existing) {
    const insertResult = await db.query<{ id: number }>(`
      INSERT INTO catalog_items (
        source_site,
        source_type,
        source_url,
        source_id,
        title,
        description,
        images_json,
        extra_json,
        content_hash,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id
    `, [
      item.sourceSite,
      item.sourceType,
      item.sourceUrl,
      item.sourceId,
      item.title,
      item.description,
      imagesJson,
      extraJson,
      contentHash,
    ])

    return {
      action: "inserted",
      itemId: insertResult.rows[0].id,
    }
  }

  if (existing.content_hash === contentHash) {
    return {
      action: "skipped",
      itemId: existing.id,
    }
  }

  await db.query(`
    UPDATE catalog_items
    SET source_url = $1,
        title = $2,
        description = $3,
        images_json = $4,
        extra_json = $5,
        content_hash = $6,
        updated_at = NOW()
    WHERE id = $7
  `, [
    item.sourceUrl,
    item.title,
    item.description,
    imagesJson,
    extraJson,
    contentHash,
    existing.id,
  ])

  return {
    action: "updated",
    itemId: existing.id,
  }
}
