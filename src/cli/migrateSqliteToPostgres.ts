import { existsSync } from "node:fs"
import { Database } from "bun:sqlite"
import { getDatabaseUrl, getDb } from "../db/client.ts"
import { ensureCatalogSchema } from "../db/schema.ts"

type SqliteCatalogItemRow = {
  id: number
  source_site: string
  source_type: string
  source_url: string
  source_id: string
  title: string
  description: string
  images_json: string
  extra_json: string
  content_hash: string
  created_at: string
  updated_at: string
}

const sqlitePath = `${process.cwd()}/data/catalog.sqlite`

if (!existsSync(sqlitePath)) {
  console.error(`SQLite database not found at ${sqlitePath}`)
  process.exit(1)
}

await ensureCatalogSchema()

const sqlite = new Database(sqlitePath, { readonly: true })
const postgres = getDb()

const rows = sqlite.query<SqliteCatalogItemRow, []>(`
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
    content_hash,
    created_at,
    updated_at
  FROM catalog_items
  ORDER BY id ASC
`).all()

for (const row of rows) {
  await postgres.query(`
    INSERT INTO catalog_items (
      id,
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
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (source_site, source_type, source_id)
    DO UPDATE SET
      source_url = EXCLUDED.source_url,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      images_json = EXCLUDED.images_json,
      extra_json = EXCLUDED.extra_json,
      content_hash = EXCLUDED.content_hash,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at
  `, [
    row.id,
    row.source_site,
    row.source_type,
    row.source_url,
    row.source_id,
    row.title,
    row.description,
    row.images_json,
    row.extra_json,
    row.content_hash,
    row.created_at,
    row.updated_at,
  ])
}

await postgres.query(`
  SELECT setval(
    pg_get_serial_sequence('catalog_items', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM catalog_items), 0), 1),
    true
  )
`)

console.log(JSON.stringify({
  databaseUrl: getDatabaseUrl(),
  sqlitePath,
  migrated: rows.length,
}, null, 2))

sqlite.close()
await postgres.end()
