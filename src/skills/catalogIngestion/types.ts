export type AlbumIngestionInput = {
  mode: "album"
  url: string
}

export type CategoryIngestionInput = {
  mode: "category"
  url: string
  limit: number
}

export type CatalogSkillInput = AlbumIngestionInput | CategoryIngestionInput
export type CatalogIngestionInput = AlbumIngestionInput

export type RawYupooAlbum = {
  sourceUrl: string
  sourceSite: "yupoo"
  sourceType: "album"
  albumId: string
  shopName?: string
  owner?: string
  rawTitle: string
  rawDescription: string
  imageUrls: string[]
  datePublished?: string
  dateModified?: string
  rawJsonLd?: unknown
}

export type CatalogItem = {
  sourceSite: "yupoo"
  sourceType: "album"
  sourceUrl: string
  sourceId: string
  title: string
  description: string
  images: string[]
  extra: Record<string, unknown>
}

export type PersistResult = {
  action: "inserted" | "updated" | "skipped"
  itemId: number
}

export type AlbumIngestionResult = {
  status: "success" | "error"
  sourceType: "album"
  sourceUrl: string
  inserted: number
  updated: number
  skipped: number
  item?: CatalogItem
  error?: string
}

export type CatalogIngestionResult = AlbumIngestionResult

export type ParsedYupooCategoryPage = {
  sourceUrl: string
  sourceSite: "yupoo"
  sourceType: "category"
  categoryId: string
  categoryTitle: string
  estimatedTotalAlbums: number
  currentPage: number
  totalPages: number
  albumUrls: string[]
  nextPageUrl?: string
}

export type CategoryIngestionDeps = {
  fetchCategoryPage: (url: string) => Promise<string>
  runAlbum: (url: string) => Promise<AlbumIngestionResult>
}

export type CategoryIngestionResult = {
  status: "success" | "error"
  sourceType: "category"
  sourceUrl: string
  estimatedTotalAlbums: number
  plannedPages: number
  processedAlbums: number
  inserted: number
  updated: number
  skipped: number
  failed: number
  albumResults: AlbumIngestionResult[]
  error?: string
}

export type CatalogSkillResult = AlbumIngestionResult | CategoryIngestionResult
