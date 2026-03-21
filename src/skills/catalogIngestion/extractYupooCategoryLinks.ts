import { absolutizeYupooUrl, parseYupooCategoryId } from "../../lib/urls.ts"
import type { ParsedYupooCategoryPage } from "./types.ts"

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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function extractAlbumUrls(html: string, origin: string): string[] {
  const matches = html.matchAll(/href=["']([^"']*\/albums\/\d+[^"']*)["']/gi)

  return uniqueStrings(
    [...matches].map((match) => absolutizeYupooUrl(match[1], origin)),
  )
}

function extractNextPageUrl(html: string, origin: string): string | undefined {
  const nextMatch = html.match(/<a[^>]*href=["']([^"']*\/categories\/\d+\?page=\d+[^"']*)["'][^>]*>\s*下一页\s*<\/a>/i)
  if (nextMatch?.[1]) return absolutizeYupooUrl(nextMatch[1], origin)

  const genericMatch = html.match(/href=["']([^"']*\/categories\/\d+\?page=(\d+)[^"']*)["']/i)
  return genericMatch?.[1] ? absolutizeYupooUrl(genericMatch[1], origin) : undefined
}

function extractEstimatedTotalAlbums(html: string, albumCount: number): number {
  const exact = html.match(/共\s*(\d+)\s*个相册/)
  if (exact?.[1]) return Number(exact[1])
  return albumCount
}

function extractTotalPages(html: string): number {
  const exact = html.match(/共\s*(\d+)\s*页/)
  if (exact?.[1]) return Number(exact[1])

  const pageDisplay = html.match(/(\d+)\s*\/\s*(\d+)/)
  if (pageDisplay?.[2]) return Number(pageDisplay[2])

  return 1
}

function extractCurrentPage(html: string, url: string): number {
  const pageDisplay = html.match(/(\d+)\s*\/\s*(\d+)/)
  if (pageDisplay?.[1]) return Number(pageDisplay[1])

  const page = new URL(url).searchParams.get("page")
  return page ? Number(page) : 1
}

function extractCategoryTitle(html: string): string {
  const bracketed = html.match(/【[^】]+】/)
  if (bracketed?.[0]) return bracketed[0]

  return extractTagText(html, "h1") ?? extractTagText(html, "title")?.split("|")[0]?.trim() ?? ""
}

export function parseYupooCategoryHtml(html: string, url: string): ParsedYupooCategoryPage {
  const categoryId = parseYupooCategoryId(url)
  if (!categoryId) throw new Error("invalid category url")

  const origin = new URL(url).origin
  const albumUrls = extractAlbumUrls(html, origin)
  const categoryTitle = extractCategoryTitle(html)

  if (!categoryTitle) throw new Error("category extraction failed: missing title")
  if (albumUrls.length === 0) throw new Error("category extraction failed: no album links")

  return {
    sourceUrl: url,
    sourceSite: "yupoo",
    sourceType: "category",
    categoryId,
    categoryTitle,
    estimatedTotalAlbums: extractEstimatedTotalAlbums(html, albumUrls.length),
    currentPage: extractCurrentPage(html, url),
    totalPages: extractTotalPages(html),
    albumUrls,
    nextPageUrl: extractNextPageUrl(html, origin),
  }
}

export async function extractYupooCategoryLinks(url: string): Promise<ParsedYupooCategoryPage> {
  if (!parseYupooCategoryId(url)) {
    throw new Error("invalid category url")
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`category page load failed: ${response.status}`)
  }

  return parseYupooCategoryHtml(await response.text(), url)
}
