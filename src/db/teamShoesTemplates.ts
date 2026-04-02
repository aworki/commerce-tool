import { ensureCatalogSchema } from "./schema.ts"

export type TeamShoesTemplateRow = {
  id: number
  team_description: string
  product_description_template: string
  key_information_template: string
  seo_title_template: string
  seo_description_template: string
  created_at: string
  updated_at: string
}

export type TeamShoesTemplateRecord = {
  id: number
  teamDescription: string
  productDescriptionTemplate: string
  keyInformationTemplate: string
  seoTitleTemplate: string
  seoDescriptionTemplate: string
  createdAt: string
  updatedAt: string
}

export type CreateTeamShoesTemplateInput = {
  teamDescription: string
  productDescriptionTemplate: string
  keyInformationTemplate: string
  seoTitleTemplate: string
  seoDescriptionTemplate: string
}

function toRecord(row: TeamShoesTemplateRow): TeamShoesTemplateRecord {
  return {
    id: row.id,
    teamDescription: row.team_description,
    productDescriptionTemplate: row.product_description_template,
    keyInformationTemplate: row.key_information_template,
    seoTitleTemplate: row.seo_title_template,
    seoDescriptionTemplate: row.seo_description_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function loadOne(query: string, values: unknown[]): Promise<TeamShoesTemplateRecord | undefined> {
  const db = await ensureCatalogSchema()
  const result = await db.query<TeamShoesTemplateRow>(query, values)
  const row = result.rows[0]

  return row ? toRecord(row) : undefined
}

const teamShoesTemplateColumns = `
  id,
  team_description,
  product_description_template,
  key_information_template,
  seo_title_template,
  seo_description_template,
  created_at,
  updated_at
`

export async function createTeamShoesTemplate(input: CreateTeamShoesTemplateInput): Promise<TeamShoesTemplateRecord> {
  const created = await loadOne(`
    INSERT INTO team_shoes_content_templates (
      team_description,
      product_description_template,
      key_information_template,
      seo_title_template,
      seo_description_template,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    RETURNING ${teamShoesTemplateColumns}
  `, [
    input.teamDescription,
    input.productDescriptionTemplate,
    input.keyInformationTemplate,
    input.seoTitleTemplate,
    input.seoDescriptionTemplate,
  ])

  if (!created) {
    throw new Error("failed to create team shoes template")
  }

  return created
}

export async function listTeamShoesTemplates(): Promise<TeamShoesTemplateRecord[]> {
  const db = await ensureCatalogSchema()
  const result = await db.query<TeamShoesTemplateRow>(`
    SELECT ${teamShoesTemplateColumns}
    FROM team_shoes_content_templates
    ORDER BY id ASC
  `)

  return result.rows.map(toRecord)
}

export function getTeamShoesTemplateById(id: number): Promise<TeamShoesTemplateRecord | undefined> {
  return loadOne(`
    SELECT ${teamShoesTemplateColumns}
    FROM team_shoes_content_templates
    WHERE id = $1
  `, [id])
}
