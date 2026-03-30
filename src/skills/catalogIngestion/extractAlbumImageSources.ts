import type { ExtractedAlbumImages } from "./types.ts"

type SourceCandidate = {
  rawUrl: string
  priority: number
}

function getAllImageTags(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0])
}

function getAttributeValue(tag: string, attributeName: string): string | undefined {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = tag.match(new RegExp(`${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
  const value = match?.[1] ?? match?.[2] ?? match?.[3]
  return value?.trim() || undefined
}

function getSourceCandidate(imageTag: string): SourceCandidate | undefined {
  const sourceAttributes = [
    ["data-origin-src", 3],
    ["data-src", 2],
    ["src", 1],
  ] as const

  for (const [attributeName, priority] of sourceAttributes) {
    const value = getAttributeValue(imageTag, attributeName)
    if (value) {
      return { rawUrl: value, priority }
    }
  }

  return undefined
}

function normalizeImageUrl(rawUrl: string): string {
  const normalizedUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl

  let url: URL
  try {
    url = new URL(normalizedUrl)
  } catch {
    throw new Error("invalid image url")
  }

  if (url.host !== "photo.yupoo.com") {
    throw new Error("image host must be photo.yupoo.com")
  }

  return url.toString()
}

function getYupooImageIdentity(url: string): string {
  const { pathname } = new URL(url)
  const [owner, imageId] = pathname.split("/").filter(Boolean)
  return owner && imageId ? `${owner}/${imageId}` : url
}

function getFirstImageTagInClassBlock(html: string, className: string): string | undefined {
  const block = html.match(new RegExp(`<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"))?.[1]
  if (!block) return undefined
  return getAllImageTags(block)[0]
}

function getFirstImageTagPerClassBlock(html: string, className: string): string[] {
  return [...html.matchAll(new RegExp(`<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "gi"))]
    .map((match) => getAllImageTags(match[1] ?? "")[0])
    .filter((tag): tag is string => Boolean(tag))
}

function getGalleryImageTags(html: string): string[] {
  const childBlockTags = getFirstImageTagPerClassBlock(html, "showalbum__children")
  if (childBlockTags.length > 0) return childBlockTags

  const parentBlock = html.match(/<[^>]+class=["'][^"']*showalbum__parent[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1]
  return parentBlock ? getAllImageTags(parentBlock) : []
}

export function extractAlbumImageSources(html: string): ExtractedAlbumImages {
  const coverTag =
    getFirstImageTagInClassBlock(html, "showalbumheader__gallerycover") ??
    getFirstImageTagInClassBlock(html, "showalbumheader__main")
  const coverSource = coverTag ? getSourceCandidate(coverTag) : undefined

  if (!coverSource) {
    throw new Error("missing cover image")
  }

  const imagesByIdentity = new Map<string, { url: string; priority: number }>()
  const orderedIdentities: string[] = []

  for (const source of [coverSource, ...getGalleryImageTags(html).map((tag) => getSourceCandidate(tag)).filter(Boolean)]) {
    const normalizedUrl = normalizeImageUrl(source.rawUrl)
    const identity = getYupooImageIdentity(normalizedUrl)
    const existing = imagesByIdentity.get(identity)

    if (!existing) {
      orderedIdentities.push(identity)
      imagesByIdentity.set(identity, { url: normalizedUrl, priority: source.priority })
      continue
    }

    if (source.priority > existing.priority) {
      imagesByIdentity.set(identity, { url: normalizedUrl, priority: source.priority })
    }
  }

  return {
    sourceImageUrls: orderedIdentities.map((identity) => imagesByIdentity.get(identity)!.url),
    logicalImageCount: orderedIdentities.length,
  }
}
