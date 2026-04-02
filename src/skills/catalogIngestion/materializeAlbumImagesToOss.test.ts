import { describe, expect, mock, test } from "bun:test"
import {
  assertOssConfig,
  buildAlbumImageObjectKey,
  buildPublicOssUrl,
  materializeAlbumImagesToOss,
  resolveImageExtension,
} from "./materializeAlbumImagesToOss.ts"

const VALID_ENV = {
  ALIYUN_OSS_REGION: "oss-cn-beijing",
  ALIYUN_OSS_BUCKET: "yupoo-album",
  ALIYUN_OSS_ENDPOINT: "https://oss-cn-beijing.aliyuncs.com",
  ALIYUN_OSS_ACCESS_KEY_ID: "test-id",
  ALIYUN_OSS_ACCESS_KEY_SECRET: "test-secret",
  ALIYUN_OSS_PUBLIC_BASE_URL: "https://cdn.example.com",
} as NodeJS.ProcessEnv

describe("materializeAlbumImagesToOss", () => {
  test("builds category-aware deterministic object keys", () => {
    const args = {
      storageCategoryId: "4372478",
      albumId: "230153753",
      index: 0,
      sourceImageUrl: "https://photo.yupoo.com/lol2021/95db5aef/d1218f62.jpg",
    }

    expect(buildAlbumImageObjectKey(args)).toBe(buildAlbumImageObjectKey(args))
    expect(buildAlbumImageObjectKey(args)).toContain("catalog/yupoo/4372478/230153753/00-")
  })

  test("uses only safe extensions from the source url", () => {
    expect(resolveImageExtension("https://photo.yupoo.com/lol2021/a/file.webp", "image/jpeg")).toBe("webp")
  })

  test("falls back to content-type when the source url has no safe extension", () => {
    expect(resolveImageExtension("https://photo.yupoo.com/lol2021/a/file", "image/png")).toBe("png")
  })

  test("falls back to jpg when neither url nor content-type gives a safe extension", () => {
    expect(resolveImageExtension("https://photo.yupoo.com/lol2021/a/file", "application/octet-stream")).toBe("jpg")
  })

  test("fails fast when required OSS env is missing", () => {
    expect(() => assertOssConfig({
      ALIYUN_OSS_BUCKET: "",
    } as NodeJS.ProcessEnv)).toThrow("missing OSS configuration: ALIYUN_OSS_BUCKET")
  })

  test("does not fetch or upload when required OSS env is missing", async () => {
    const fetchImpl = mock(async () => new Response(""))
    const put = mock(async () => ({}))

    await expect(materializeAlbumImagesToOss({
      albumId: "230153753",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      storageCategoryId: "uncategorized",
      sourceImageUrls: ["https://photo.yupoo.com/lol2021/a/raw-a.jpg"],
      env: {} as NodeJS.ProcessEnv,
      fetchImpl,
      createClient: () => ({ put }),
    })).rejects.toThrow("missing OSS configuration")

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  test("builds canonical unsigned public URLs", () => {
    expect(buildPublicOssUrl("https://cdn.example.com", "catalog/yupoo/uncategorized/230153753/00-hash.jpg")).toBe(
      "https://cdn.example.com/catalog/yupoo/uncategorized/230153753/00-hash.jpg",
    )
  })

  test("uploads each image and returns canonical public urls", async () => {
    const put = mock(async () => ({}))
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("photo.yupoo.com")
      expect(init?.headers).toMatchObject({
        Referer: "https://lol2021.x.yupoo.com/albums/230153753",
      })
      expect(String((init?.headers as Record<string, string>)?.["User-Agent"] ?? "")).toContain("Mozilla/5.0")

      return new Response(String(url), {
        headers: { "content-type": "image/jpeg" },
      })
    })

    const urls = await materializeAlbumImagesToOss({
      albumId: "230153753",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      storageCategoryId: "4372478",
      sourceImageUrls: [
        "https://photo.yupoo.com/lol2021/a/raw-a.jpg",
        "https://photo.yupoo.com/lol2021/b/raw-b.webp",
      ],
      env: VALID_ENV,
      fetchImpl,
      createClient: () => ({ put }),
    })

    expect(put).toHaveBeenCalledTimes(2)
    expect(urls).toEqual([
      expect.stringContaining("https://cdn.example.com/catalog/yupoo/4372478/230153753/00-"),
      expect.stringContaining("https://cdn.example.com/catalog/yupoo/4372478/230153753/01-"),
    ])
  })

  test("downloads source images with album referer and browser user-agent", async () => {
    const fetchImpl = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Referer: "https://lol2021.x.yupoo.com/albums/230153753",
      })
      expect(String((init?.headers as Record<string, string>)?.["User-Agent"] ?? "")).toContain("Mozilla/5.0")

      return new Response("ok", {
        headers: { "content-type": "image/jpeg" },
      })
    })

    await materializeAlbumImagesToOss({
      albumId: "230153753",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      storageCategoryId: "4372478",
      sourceImageUrls: ["https://photo.yupoo.com/lol2021/a/raw-a.jpg"],
      env: VALID_ENV,
      fetchImpl,
      createClient: () => ({ put: async () => ({}) }),
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test("retries a transient source-image fetch failure", async () => {
    let attempts = 0
    const fetchImpl = mock(async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error("The socket connection was closed unexpectedly")
      }

      return new Response("ok", {
        headers: { "content-type": "image/jpeg" },
      })
    })

    const urls = await materializeAlbumImagesToOss({
      albumId: "230153753",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      storageCategoryId: "uncategorized",
      sourceImageUrls: ["https://photo.yupoo.com/lol2021/a/raw-a.jpg"],
      env: VALID_ENV,
      fetchImpl,
      createClient: () => ({ put: async () => ({}) }),
    })

    expect(attempts).toBe(2)
    expect(urls).toHaveLength(1)
  })

  test("retries when the source-image body read is reset", async () => {
    let attempts = 0
    const fetchImpl = mock(async () => {
      attempts += 1

      const response = new Response("ok", {
        headers: { "content-type": "image/jpeg" },
      })

      if (attempts === 1) {
        response.arrayBuffer = mock(async () => {
          throw new Error("ECONNRESET while reading body")
        })
      }

      return response
    })

    const urls = await materializeAlbumImagesToOss({
      albumId: "230153753",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      storageCategoryId: "uncategorized",
      sourceImageUrls: ["https://photo.yupoo.com/lol2021/a/raw-a.jpg"],
      env: VALID_ENV,
      fetchImpl,
      createClient: () => ({ put: async () => ({}) }),
    })

    expect(attempts).toBe(2)
    expect(urls).toHaveLength(1)
  })

  test("keeps retrying transient source-image resets across several attempts", async () => {
    let attempts = 0
    const fetchImpl = mock(async () => {
      attempts += 1
      if (attempts < 6) {
        throw new Error("The socket connection was closed unexpectedly")
      }

      return new Response("ok", {
        headers: { "content-type": "image/jpeg" },
      })
    })

    const urls = await materializeAlbumImagesToOss({
      albumId: "230153753",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      storageCategoryId: "uncategorized",
      sourceImageUrls: ["https://photo.yupoo.com/lol2021/a/raw-a.jpg"],
      env: VALID_ENV,
      fetchImpl,
      createClient: () => ({ put: async () => ({}) }),
    })

    expect(attempts).toBe(6)
    expect(urls).toHaveLength(1)
  })

  test("keeps retrying transient body-read resets across several attempts", async () => {
    let attempts = 0
    const fetchImpl = mock(async () => {
      attempts += 1

      const response = new Response("ok", {
        headers: { "content-type": "image/jpeg" },
      })

      if (attempts < 6) {
        response.arrayBuffer = mock(async () => {
          throw new Error("ECONNRESET while reading body")
        })
      }

      return response
    })

    const urls = await materializeAlbumImagesToOss({
      albumId: "230153753",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      storageCategoryId: "uncategorized",
      sourceImageUrls: ["https://photo.yupoo.com/lol2021/a/raw-a.jpg"],
      env: VALID_ENV,
      fetchImpl,
      createClient: () => ({ put: async () => ({}) }),
    })

    expect(attempts).toBe(6)
    expect(urls).toHaveLength(1)
  })

  test("fails the batch when any upload fails", async () => {
    const mockFetchOk = async () => new Response("ok", {
      headers: { "content-type": "image/jpeg" },
    })

    await expect(materializeAlbumImagesToOss({
      albumId: "230153753",
      sourceUrl: "https://lol2021.x.yupoo.com/albums/230153753",
      storageCategoryId: "uncategorized",
      sourceImageUrls: [
        "https://photo.yupoo.com/lol2021/a/raw-a.jpg",
        "https://photo.yupoo.com/lol2021/b/raw-b.jpg",
      ],
      env: VALID_ENV,
      fetchImpl: mockFetchOk,
      createClient: () => ({
        put: async (key: string) => {
          if (key.includes("01-")) throw new Error("upload failed")
        },
      }),
    })).rejects.toThrow("upload failed")
  })
})
