import type { CatalogItem, RawYupooAlbum, ResolvedAlbumCategoryContext } from "./types.ts"

function compactText(input: string): string {
  return input.replace(/\s+/g, " ").trim()
}

function compactMultilineText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => compactText(line))
    .filter(Boolean)
    .join("\n")
}

export function normalizeYupooAlbum(
  raw: RawYupooAlbum,
  ossImageUrls: string[],
  resolvedCategoryContext: ResolvedAlbumCategoryContext,
): CatalogItem {
  return {
    sourceSite: raw.sourceSite,
    sourceType: raw.sourceType,
    sourceUrl: raw.sourceUrl,
    sourceId: raw.albumId,
    title: compactText(raw.rawTitle),
    description: compactMultilineText(raw.rawDescription),
    images: ossImageUrls,
    extra: {
      source_url: raw.sourceUrl,
      source_site: raw.sourceSite,
      source_type: raw.sourceType,
      album_id: raw.albumId,
      shop_name: raw.shopName ?? null,
      owner: raw.owner ?? null,
      image_count: raw.logicalImageCount,
      date_published: raw.datePublished ?? null,
      date_modified: raw.dateModified ?? null,
      raw_title: raw.rawTitle,
      category_id: resolvedCategoryContext.categoryId ?? null,
      category_title: resolvedCategoryContext.categoryTitle ?? null,
      category_url: resolvedCategoryContext.categoryUrl ?? null,
      mode: "album",
    },
  }
}
