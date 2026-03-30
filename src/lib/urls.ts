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

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

export function getRequiredAliyunOssPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim()

  if (!value) {
    throw new Error("missing OSS configuration: ALIYUN_OSS_PUBLIC_BASE_URL")
  }

  return trimTrailingSlash(value)
}

export function buildCanonicalAliyunOssPublicUrl(baseUrl: string, objectKey: string): string {
  return `${trimTrailingSlash(baseUrl)}/${objectKey.replace(/^\/+/, "")}`
}

export function isCanonicalAliyunOssPublicUrl(input: string, baseUrl: string): boolean {
  try {
    const candidate = new URL(input)
    const canonicalBase = new URL(trimTrailingSlash(baseUrl))
    const candidatePath = candidate.pathname.replace(/\/+$/, "")
    const basePath = canonicalBase.pathname.replace(/\/+$/, "")
    const normalizedBasePath = basePath === "/" ? "" : basePath

    return candidate.protocol === canonicalBase.protocol
      && candidate.host === canonicalBase.host
      && candidate.search === ""
      && candidate.hash === ""
      && candidatePath.length > normalizedBasePath.length
      && candidatePath.startsWith(`${normalizedBasePath}/`)
  } catch {
    return false
  }
}
