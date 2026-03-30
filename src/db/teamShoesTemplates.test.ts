import { beforeEach, describe, expect, test } from "bun:test"
import { createTeamShoesTemplate, getTeamShoesTemplateById, listTeamShoesTemplates } from "./teamShoesTemplates.ts"
import { ensureCatalogSchema } from "./schema.ts"

describe("teamShoesTemplates", () => {
  beforeEach(async () => {
    const db = await ensureCatalogSchema()
    await db.query("TRUNCATE TABLE team_shoes_content_templates RESTART IDENTITY")
  })

  test("creates, lists, and loads team shoes content templates", async () => {
    const first = await createTeamShoesTemplate({
      teamDescription: "Team Jordan",
      productDescriptionTemplate: "Premium build for {{title}}",
      keyInformationTemplate: "Runs true to size.",
      seoTitleTemplate: "Buy {{title}} now",
      seoDescriptionTemplate: "Shop the latest release from Team Jordan.",
    })

    const second = await createTeamShoesTemplate({
      teamDescription: "Team Kobe",
      productDescriptionTemplate: "Courtside detail for {{title}}",
      keyInformationTemplate: "Collector favorite.",
      seoTitleTemplate: "Discover {{title}}",
      seoDescriptionTemplate: "Browse Team Kobe highlights.",
    })

    expect(first.id).toBe(1)
    expect(first.teamDescription).toBe("Team Jordan")
    expect(first.productDescriptionTemplate).toBe("Premium build for {{title}}")
    expect(first.keyInformationTemplate).toBe("Runs true to size.")
    expect(first.seoTitleTemplate).toBe("Buy {{title}} now")
    expect(first.seoDescriptionTemplate).toBe("Shop the latest release from Team Jordan.")
    expect(Date.parse(first.createdAt)).not.toBeNaN()
    expect(Date.parse(first.updatedAt)).not.toBeNaN()

    const listed = await listTeamShoesTemplates()

    expect(listed.map((record) => ({
      id: record.id,
      teamDescription: record.teamDescription,
      productDescriptionTemplate: record.productDescriptionTemplate,
    }))).toEqual([
      {
        id: 1,
        teamDescription: "Team Jordan",
        productDescriptionTemplate: "Premium build for {{title}}",
      },
      {
        id: 2,
        teamDescription: "Team Kobe",
        productDescriptionTemplate: "Courtside detail for {{title}}",
      },
    ])

    await expect(getTeamShoesTemplateById(first.id)).resolves.toEqual(first)
    await expect(getTeamShoesTemplateById(second.id)).resolves.toEqual(second)
  })
})
