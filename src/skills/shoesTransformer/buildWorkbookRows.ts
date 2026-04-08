import type { ShoesNormalizedItem, ShoesWorkbookRow } from "./types.ts"

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

function formatSizeToken(token: string): string[] {
  const normalizedToken = token.trim()

  if (!normalizedToken) {
    return []
  }

  return [normalizedToken.replace(/^Size:/i, "").trim()]
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
      AF: null,
      AG: null,
    },
  }))
}
