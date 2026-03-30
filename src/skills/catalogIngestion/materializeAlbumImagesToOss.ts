import { createHash } from "node:crypto"
import type { MaterializeAlbumImagesInput } from "./types.ts"

type OssConfig = {
  region: string
  bucket: string
  endpoint: string
  accessKeyId: string
  accessKeySecret: string
}

type OssClient = {
  put: (key: string, body: Buffer, options: { headers: { "Content-Type": string } }) => Promise<unknown>
}

type MaterializeAlbumImagesArgs = MaterializeAlbumImagesInput & {
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  createClient?: (config: OssConfig) => OssClient | Promise<OssClient>
}

const SAFE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"])
const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}
const REQUIRED_OSS_ENV = [
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_ENDPOINT",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_PUBLIC_BASE_URL",
] as const
const YUPOO_BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
const SOURCE_FETCH_ATTEMPTS = 8

function shouldRetryImageFetch(error: unknown): boolean {
  return error instanceof Error && /socket connection was closed unexpectedly|ECONNRESET/i.test(error.message)
}

async function downloadSourceImage(args: {
  fetchImpl: typeof fetch
  sourceImageUrl: string
  sourceUrl: string
}): Promise<{ contentType: string; buffer: Buffer }> {
  let lastError: unknown

  for (let attempt = 1; attempt <= SOURCE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await args.fetchImpl(args.sourceImageUrl, {
        headers: buildImageDownloadHeaders(args.sourceUrl),
      })
      assertImageDownloadSucceeded(response)

      const contentType = response.headers.get("content-type") ?? "application/octet-stream"
      const buffer = Buffer.from(await response.arrayBuffer())

      return { contentType, buffer }
    } catch (error) {
      lastError = error
      if (!shouldRetryImageFetch(error) || attempt === SOURCE_FETCH_ATTEMPTS) {
        throw error
      }
    }
  }

  throw lastError
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function getRequiredEnv(env: NodeJS.ProcessEnv, key: (typeof REQUIRED_OSS_ENV)[number]): string {
  const value = env[key]?.trim()
  if (!value) throw new Error(`missing OSS configuration: ${key}`)
  return value
}

function normalizeAlbumSourceUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl)
  return `${url.origin}${url.pathname}`
}

function buildImageDownloadHeaders(sourceUrl: string): HeadersInit {
  return {
    Referer: normalizeAlbumSourceUrl(sourceUrl),
    "User-Agent": YUPOO_BROWSER_USER_AGENT,
  }
}

function assertImageDownloadSucceeded(response: Response) {
  if (!response.ok) {
    throw new Error(`image download failed: ${response.status}`)
  }
}

function uploadContentTypeForResponse(contentType: string): string {
  return contentType.split(";")[0]?.trim() || "application/octet-stream"
}

export function assertOssConfig(env: NodeJS.ProcessEnv) {
  for (const key of REQUIRED_OSS_ENV) {
    getRequiredEnv(env, key)
  }
}

export function resolveImageExtension(sourceImageUrl: string, contentType: string | null): string {
  const pathname = new URL(sourceImageUrl).pathname
  const extension = pathname.split(".").pop()?.toLowerCase()
  if (extension && SAFE_EXTENSIONS.has(extension)) {
    return extension === "jpeg" ? "jpg" : extension
  }

  const normalizedContentType = contentType?.split(";")[0]?.trim().toLowerCase()
  return normalizedContentType ? (CONTENT_TYPE_TO_EXTENSION[normalizedContentType] ?? "jpg") : "jpg"
}

export function buildAlbumImageObjectKey(args: {
  storageCategoryId: string
  albumId: string
  index: number
  sourceImageUrl: string
  contentType?: string | null
}) {
  const extension = resolveImageExtension(args.sourceImageUrl, args.contentType ?? null)
  const digest = createHash("sha1").update(args.sourceImageUrl).digest("hex")
  const index = String(args.index).padStart(2, "0")

  return `catalog/yupoo/${args.storageCategoryId}/${args.albumId}/${index}-${digest}.${extension}`
}

export function buildPublicOssUrl(baseUrl: string, objectKey: string) {
  return `${trimTrailingSlash(baseUrl)}/${objectKey.replace(/^\/+/, "")}`
}

async function createDefaultOssClient(config: OssConfig): Promise<OssClient> {
  const ossModule = await import("ali-oss")
  const Oss = (ossModule.default ?? ossModule) as new (config: OssConfig) => OssClient
  return new Oss(config)
}

export async function materializeAlbumImagesToOss(args: MaterializeAlbumImagesArgs): Promise<string[]> {
  const env = args.env ?? process.env
  assertOssConfig(env)

  const fetchImpl = args.fetchImpl ?? fetch
  const client = await (args.createClient ?? createDefaultOssClient)({
    region: getRequiredEnv(env, "ALIYUN_OSS_REGION"),
    bucket: getRequiredEnv(env, "ALIYUN_OSS_BUCKET"),
    endpoint: getRequiredEnv(env, "ALIYUN_OSS_ENDPOINT"),
    accessKeyId: getRequiredEnv(env, "ALIYUN_OSS_ACCESS_KEY_ID"),
    accessKeySecret: getRequiredEnv(env, "ALIYUN_OSS_ACCESS_KEY_SECRET"),
  })
  const publicBaseUrl = getRequiredEnv(env, "ALIYUN_OSS_PUBLIC_BASE_URL")

  const urls: string[] = []

  for (const [index, sourceImageUrl] of args.sourceImageUrls.entries()) {
    const { contentType, buffer } = await downloadSourceImage({
      fetchImpl,
      sourceImageUrl,
      sourceUrl: args.sourceUrl,
    })
    const objectKey = buildAlbumImageObjectKey({
      storageCategoryId: args.storageCategoryId,
      albumId: args.albumId,
      index,
      sourceImageUrl,
      contentType,
    })

    await client.put(objectKey, buffer, {
      headers: {
        "Content-Type": uploadContentTypeForResponse(contentType),
      },
    })

    urls.push(buildPublicOssUrl(publicBaseUrl, objectKey))
  }

  return urls
}
