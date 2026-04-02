import { parseYupooAlbumId } from "../../lib/urls.ts"
import { extractAlbumImageSources } from "./extractAlbumImageSources.ts"
import type { RawYupooAlbum } from "./types.ts"

type JsonLdNode = Record<string, unknown>

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function flattenJsonLd(input: unknown): JsonLdNode[] {
  if (!input) return []
  if (Array.isArray(input)) return input.flatMap(flattenJsonLd)
  if (typeof input !== "object") return []

  const node = input as Record<string, unknown>
  const graph = Array.isArray(node["@graph"]) ? node["@graph"] : []

  return [node, ...graph.flatMap(flattenJsonLd)]
}

function extractJsonLd(html: string): JsonLdNode[] {
  const matches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)

  return [...matches].flatMap((match) => {
    const text = match[1]?.trim()
    if (!text) return []

    try {
      return flattenJsonLd(JSON.parse(text))
    } catch {
      return []
    }
  })
}

function getNodeByType(nodes: JsonLdNode[], typeName: string): JsonLdNode | undefined {
  return nodes.find((node) => {
    const type = node["@type"]
    if (typeof type === "string") return type === typeName
    return Array.isArray(type) && type.includes(typeName)
  })
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function extractTagText(html: string, tagName: string): string | undefined {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"))
  const value = match?.[1] ? stripHtml(match[1]) : ""
  return value || undefined
}

function extractTitleFallback(html: string): string | undefined {
  const titleText = extractTagText(html, "title")
  if (!titleText) return undefined
  return titleText.split("|")[0]?.trim() || undefined
}

function cleanDescription(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/查看原图/g, "")
    .replace(/图片标题：/g, "")
    .replace(/所属相册：/g, "")
    .replace(/所属分类：无/g, "")
    .replace(/图片描述：/g, "")
    .trim()
}

function extractVisibleDescription(html: string, rawTitle: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyText = stripHtml(bodyMatch?.[1] ?? html)
  if (!bodyText) return ""

  const start = bodyText.indexOf(rawTitle)
  if (start === -1) return cleanDescription(bodyText.slice(0, 1000))

  const afterTitle = bodyText.slice(start + rawTitle.length).trim()
  const stopMarkers = ["申请复制", "申请下载", "分享", "微信扫码", "其他分享方式"]
  const stopIndex = stopMarkers
    .map((marker) => afterTitle.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]

  const snippet = stopIndex === undefined ? afterTitle : afterTitle.slice(0, stopIndex)
  return cleanDescription(snippet)
}

function extractDateList(html: string): string[] {
  return uniqueStrings(html.match(/20\d{2}-\d{2}-\d{2}/g) ?? [])
}

export function parseYupooAlbumHtml(html: string, url: string): RawYupooAlbum {
  const albumId = parseYupooAlbumId(url)
  if (!albumId) throw new Error("invalid album url")

  const nodes = extractJsonLd(html)
  const gallery = getNodeByType(nodes, "ImageGallery")
  const organization = getNodeByType(nodes, "Organization")

  const rawTitle =
    firstString(gallery?.name) ??
    extractTagText(html, "h1") ??
    extractTitleFallback(html) ??
    ""

  const extractedImages = extractAlbumImageSources(html)

  const rawDescription =
    cleanDescription(firstString(gallery?.description) ?? "") ||
    extractVisibleDescription(html, rawTitle)

  const sourceUrl = firstString(gallery?.url) ?? url
  const shopName = firstString(organization?.name) ?? html.match(/<title>[^|]+\|\s*相册\s*\|\s*([^<|]+)<\/title>/i)?.[1]?.trim()
  const owner = html.match(/window\.OWNER\s*=\s*['\"]([^'\"]+)['\"]/)?.[1]
  const dateList = extractDateList(html)

  if (!rawTitle) throw new Error("extraction failed: missing title")

  return {
    sourceUrl,
    sourceSite: "yupoo",
    sourceType: "album",
    albumId,
    shopName,
    owner,
    rawTitle,
    rawDescription,
    sourceImageUrls: extractedImages.sourceImageUrls,
    logicalImageCount: extractedImages.logicalImageCount,
    datePublished: firstString(gallery?.datePublished) ?? dateList[0],
    dateModified: firstString(gallery?.dateModified) ?? dateList.at(-1),
    rawJsonLd: gallery ?? { "@type": "ImageGallery" },
  }
}

export async function extractYupooAlbum(url: string): Promise<RawYupooAlbum> {
  if (!parseYupooAlbumId(url)) {
    throw new Error("invalid album url")
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`page load failed: ${response.status}`)
  }

  return parseYupooAlbumHtml(await response.text(), url)
}
