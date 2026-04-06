import type { ShoesNormalizedItem, ShoesWorkbookRow } from "./types.ts"

const SUPPORTED_SIZE_SPECS = [
  { eur: 35.5, label: "W US3.5=UK3=EUR35.5=CM22.5" },
  { eur: 36, label: "W US4=UK3.5=EUR36=CM23" },
  { eur: 36.5, label: "W US4.5=UK4=EUR36.5=CM23.5" },
  { eur: 37.5, label: "W US5=UK4.5=EUR37.5=CM23.5" },
  { eur: 38, label: "W US5.5=UK5=EU38=CM24" },
  { eur: 38.5, label: "W US6=UK5.5=EU38.5=CM24" },
  { eur: 39, label: "W US6.5=UK6=EUR39=CM24.5" },
  { eur: 40, label: "M US7=UK6=EUR40=CM25" },
  { eur: 40.5, label: "M US7.5=UK6.5=EUR40.5=CM25.5" },
  { eur: 41, label: "M US8=UK7=EUR41=CM26" },
  { eur: 42, label: "M US8.5=UK7.5=EUR42=CM26.5" },
  { eur: 42.5, label: "M US9=UK8=EUR42.5=CM27" },
  { eur: 43, label: "M US9.5=UK8.5=EUR43=CM27.5" },
  { eur: 44, label: "M US10=UK9=EUR44=CM28" },
  { eur: 44.5, label: "M US10.5=UK9.5=EUR44.5=CM28.5" },
  { eur: 45, label: "M US11=UK10=EUR45=CM29" },
  { eur: 46, label: "M US12=UK11=EUR46=CM30" },
  { eur: 47.5, label: "M US13=UK12=EUR47.5=CM31" },
] as const

function buildSharedCells(item: ShoesNormalizedItem): ShoesWorkbookRow["cells"] {
  return {
    A: null,
    B: item.cleanTitle,
    C: null,
    D: null,
    E: item.coverImageUrl || null,
    F: item.galleryImageUrls.length > 0 ? item.galleryImageUrls.join("\n") : null,
    G: null,
    H: null,
    I: "Y",
    J: null,
    K: null,
    L: null,
    M: "双",
    N: null,
    O: "N",
    P: 2,
    Q: null,
    R: null,
    S: null,
    T: null,
    U: null,
    V: null,
    W: null,
  }
}

function buildSkuValue(size: string): string | null {
  return size ? `Size:${size}` : null
}

function parseNumericSize(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function expandSizeRange(token: string): string[] {
  const match = token.match(/^(\d+(?:\.\d+)?)\s*[-~至到]+\s*(\d+(?:\.\d+)?)$/)

  if (!match) {
    return []
  }

  const start = parseNumericSize(match[1])
  const end = parseNumericSize(match[2])

  if (start === undefined || end === undefined) {
    return []
  }

  const lower = Math.min(start, end)
  const upper = Math.max(start, end)
  return SUPPORTED_SIZE_SPECS
    .filter((spec) => spec.eur >= lower && spec.eur <= upper)
    .map((spec) => spec.label)
}

function formatSizeToken(token: string): string[] {
  const normalizedToken = token.trim()

  if (!normalizedToken) {
    return []
  }

  if (/^Size:/i.test(normalizedToken) || normalizedToken.includes("=") || /^(W|M)\s+US/i.test(normalizedToken)) {
    return [normalizedToken.replace(/^Size:/i, "").trim()]
  }

  const expandedRange = expandSizeRange(normalizedToken)

  if (expandedRange.length > 0) {
    return expandedRange
  }

  const numericSize = parseNumericSize(normalizedToken)

  if (numericSize !== undefined) {
    const matchedSpec = SUPPORTED_SIZE_SPECS.find((spec) => spec.eur === numericSize)
    return matchedSpec ? [matchedSpec.label] : [normalizedToken]
  }

  return [normalizedToken]
}

function buildSpecValues(sizeValues: string[]): string[] {
  return sizeValues.flatMap(formatSizeToken)
}

export function buildWorkbookRows(item: ShoesNormalizedItem): ShoesWorkbookRow[] {
  const sharedCells = buildSharedCells(item)
  const specValues = buildSpecValues(item.sizeValues)

  if (specValues.length === 0) {
    return [{
      kind: "first",
      cells: sharedCells,
    }]
  }

  return specValues.map((size, index) => ({
    kind: index === 0 ? "first" : "continuation",
    cells: {
      ...(index === 0 ? sharedCells : {}),
      X: index === 0 ? ["Size", ...specValues].join("\n") : null,
      Y: null,
      Z: null,
      AA: null,
      AB: buildSkuValue(size),
      AC: null,
      AD: null,
      AE: null,
      AF: 99,
      AG: null,
    },
  }))
}
