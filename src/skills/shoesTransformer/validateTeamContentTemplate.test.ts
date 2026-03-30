import { describe, expect, test } from "bun:test"
import { validateTeamContentTemplate } from "./validateTeamContentTemplate.ts"

describe("validateTeamContentTemplate", () => {
  test("trims fields and accepts plain text plus exact {{title}}", () => {
    expect(validateTeamContentTemplate({
      teamDescription: "  Team Jordan  ",
      productDescriptionTemplate: "  Premium materials and comfort.  ",
      keyInformationTemplate: "  Inspired by {{title}}  ",
      seoTitleTemplate: "  Buy {{title}} today  ",
      seoDescriptionTemplate: "  Limited release for collectors.  ",
    })).toEqual({
      teamDescription: "Team Jordan",
      productDescriptionTemplate: "Premium materials and comfort.",
      keyInformationTemplate: "Inspired by {{title}}",
      seoTitleTemplate: "Buy {{title}} today",
      seoDescriptionTemplate: "Limited release for collectors.",
    })
  })

  test("rejects empty team_description after trimming", () => {
    expect(() => validateTeamContentTemplate({
      teamDescription: "   ",
      productDescriptionTemplate: "Details about {{title}}",
      keyInformationTemplate: "Key information",
      seoTitleTemplate: "SEO title",
      seoDescriptionTemplate: "SEO description",
    })).toThrow(/teamDescription/i)
  })

  test("rejects empty template fields after trimming", () => {
    const baseInput = {
      teamDescription: "Team Jordan",
      productDescriptionTemplate: "Details about {{title}}",
      keyInformationTemplate: "Key information",
      seoTitleTemplate: "SEO title",
      seoDescriptionTemplate: "SEO description",
    }

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      productDescriptionTemplate: "   ",
    })).toThrow(/productDescriptionTemplate/i)

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      keyInformationTemplate: "   ",
    })).toThrow(/keyInformationTemplate/i)

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      seoTitleTemplate: "   ",
    })).toThrow(/seoTitleTemplate/i)

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      seoDescriptionTemplate: "   ",
    })).toThrow(/seoDescriptionTemplate/i)
  })

  test("rejects unsupported placeholder tokens", () => {
    const baseInput = {
      teamDescription: "Team Jordan",
      productDescriptionTemplate: "Details about {{title}}",
      keyInformationTemplate: "Key information",
      seoTitleTemplate: "SEO title",
      seoDescriptionTemplate: "SEO description",
    }

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      productDescriptionTemplate: "Details about {{sku}}",
    })).toThrow(/unsupported placeholder/i)

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      keyInformationTemplate: "Key information for {{ title }}",
    })).toThrow(/unsupported placeholder/i)

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      seoTitleTemplate: "Buy {{title }} today",
    })).toThrow(/unsupported placeholder/i)

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      seoDescriptionTemplate: "Shop {{Title}} now",
    })).toThrow(/unsupported placeholder/i)

    expect(() => validateTeamContentTemplate({
      ...baseInput,
      seoDescriptionTemplate: "Shop {{}} now",
    })).toThrow(/unsupported placeholder/i)
  })
})
