function parseYupooId(input: string, pattern: RegExp): string | null {
  try {
    const url = new URL(input)
    if (!url.hostname.endsWith("yupoo.com")) return null

    const match = url.pathname.match(pattern)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export function parseYupooAlbumId(input: string): string | null {
  return parseYupooId(input, /\/albums\/(\d+)/)
}

export function parseYupooCategoryId(input: string): string | null {
  return parseYupooId(input, /\/categories\/(\d+)/)
}

export function isYupooAlbumUrl(input: string): boolean {
  return parseYupooAlbumId(input) !== null
}

export function isYupooCategoryUrl(input: string): boolean {
  return parseYupooCategoryId(input) !== null
}

export function absolutizeYupooUrl(url: string, origin: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  if (url.startsWith("//")) return `https:${url}`
  return new URL(url, origin).toString()
}
