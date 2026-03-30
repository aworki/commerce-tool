export type TeamContentTemplateInput = {
  teamDescription: string
  productDescriptionTemplate: string
  keyInformationTemplate: string
  seoTitleTemplate: string
  seoDescriptionTemplate: string
}

const templateFieldNames = [
  "productDescriptionTemplate",
  "keyInformationTemplate",
  "seoTitleTemplate",
  "seoDescriptionTemplate",
] as const satisfies ReadonlyArray<keyof Omit<TeamContentTemplateInput, "teamDescription">>

function trimRequiredField(value: string, fieldName: keyof TeamContentTemplateInput) {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new Error(`${fieldName} cannot be empty`)
  }

  return trimmed
}

function assertSupportedPlaceholders(value: string, fieldName: keyof TeamContentTemplateInput) {
  const tokens = value.match(/\{\{.*?\}\}/g) ?? []

  for (const token of tokens) {
    if (token !== "{{title}}") {
      throw new Error(`${fieldName} contains unsupported placeholder token: ${token}`)
    }
  }
}

export function validateTeamContentTemplate(input: TeamContentTemplateInput): TeamContentTemplateInput {
  const teamDescription = trimRequiredField(input.teamDescription, "teamDescription")
  const productDescriptionTemplate = trimRequiredField(input.productDescriptionTemplate, "productDescriptionTemplate")
  const keyInformationTemplate = trimRequiredField(input.keyInformationTemplate, "keyInformationTemplate")
  const seoTitleTemplate = trimRequiredField(input.seoTitleTemplate, "seoTitleTemplate")
  const seoDescriptionTemplate = trimRequiredField(input.seoDescriptionTemplate, "seoDescriptionTemplate")

  const trimmed = {
    teamDescription,
    productDescriptionTemplate,
    keyInformationTemplate,
    seoTitleTemplate,
    seoDescriptionTemplate,
  }

  for (const fieldName of templateFieldNames) {
    assertSupportedPlaceholders(trimmed[fieldName], fieldName)
  }

  return trimmed
}
