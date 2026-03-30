import type { CatalogItemRecord } from "../../db/catalogItems.ts"
import type { ShoesNormalizedItem, ShoesTransformWarning } from "./types.ts"

function compactText(input: string): string {
  return input.replace(/\s+/g, " ").trim()
}

export function cleanShoesTitle(title: string): string {
  const compactedTitle = compactText(title)
  const chineseMatches = [...compactedTitle.matchAll(/\p{Script=Han}/gu)]
  const lastChinese = chineseMatches.at(-1)

  if (!lastChinese || lastChinese.index === undefined) {
    return compactedTitle
  }

  const suffix = compactText(compactedTitle.slice(lastChinese.index + lastChinese[0].length))
  return suffix || compactedTitle
}

function extractSizeFragment(description: string): string | undefined {
  const match = description.match(/尺码/i)

  if (!match || match.index === undefined) {
    return undefined
  }

  const tail = description.slice(match.index + match[0].length).trimStart()
  const fragment = tail.match(/^[#:：\s]*([0-9.#,，、/\-~至到 ]+)/)?.[1]
  return fragment ? compactText(fragment.replace(/#/g, "")) : undefined
}

export function parseSizeValuesFromDescription(description: string): string[] {
  const fragment = extractSizeFragment(description)

  if (!fragment) {
    return []
  }

  return fragment
    .split(/[\s,，、/]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => {
      const values = token.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
      return values.length > 0 && values.every((value) => value >= 20 && value <= 60)
    })
}

function createWarning(sourceId: string, field: string, message: string): ShoesTransformWarning {
  return { sourceId, field, message }
}

export function normalizeCatalogItemForShoes(item: CatalogItemRecord, options: { tags: string[] }): ShoesNormalizedItem {
  const warnings: ShoesTransformWarning[] = []
  const tags = options.tags.map((tag) => compactText(tag)).filter(Boolean)
  const coverImageUrl = item.images[0] ?? ""
  const galleryImageUrls = item.images.slice(1)
  const sizeValues = parseSizeValuesFromDescription(item.description)

  if (!coverImageUrl) {
    warnings.push(createWarning(item.sourceId, "E", "商品首图为空，需要人工补充"))
  }

  if (sizeValues.length === 0) {
    warnings.push(createWarning(item.sourceId, "X/AB", "未能从商品描述解析尺码，需要人工补充规格和 SKU"))
  }

  warnings.push(
    createWarning(item.sourceId, "D", "商品描述按当前规则留空"),
    createWarning(item.sourceId, "G", "关键信息按当前规则留空"),
    createWarning(item.sourceId, "J", "物流模板按当前规则留空"),
    createWarning(item.sourceId, "T", "SEO 标题按当前规则留空"),
    createWarning(item.sourceId, "U", "SEO 描述按当前规则留空"),
    createWarning(item.sourceId, "AD", "售价按当前规则留空"),
  )

  return {
    item,
    cleanTitle: cleanShoesTitle(item.title),
    coverImageUrl,
    galleryImageUrls,
    sizeValues,
    tags,
    warnings,
  }
}
