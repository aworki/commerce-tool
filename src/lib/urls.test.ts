import { describe, expect, test } from "bun:test"
import {
  buildCanonicalAliyunOssPublicUrl,
  getRequiredAliyunOssPublicBaseUrl,
  isCanonicalAliyunOssPublicUrl,
  trimTrailingSlash,
} from "./urls.ts"

describe("Aliyun OSS URL helpers", () => {
  test("trims trailing slashes from a base url", () => {
    expect(trimTrailingSlash("https://cdn.example.com///")).toBe("https://cdn.example.com")
  })

  test("reads and normalizes the required public base url from env", () => {
    expect(getRequiredAliyunOssPublicBaseUrl({
      ALIYUN_OSS_PUBLIC_BASE_URL: "https://cdn.example.com///",
    } as NodeJS.ProcessEnv)).toBe("https://cdn.example.com")
  })

  test("throws when the public base url is missing", () => {
    expect(() => getRequiredAliyunOssPublicBaseUrl({} as NodeJS.ProcessEnv)).toThrow(
      "missing OSS configuration: ALIYUN_OSS_PUBLIC_BASE_URL",
    )
  })

  test("builds canonical public urls from a base url and object key", () => {
    expect(buildCanonicalAliyunOssPublicUrl(
      "https://cdn.example.com/",
      "/catalog/yupoo/4372478/230153753/00-hash.jpg",
    )).toBe("https://cdn.example.com/catalog/yupoo/4372478/230153753/00-hash.jpg")
  })

  test("accepts canonical unsigned public urls under the configured base", () => {
    expect(isCanonicalAliyunOssPublicUrl(
      "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-hash.jpg",
      "https://cdn.example.com",
    )).toBe(true)
  })

  test("rejects urls outside the configured base", () => {
    expect(isCanonicalAliyunOssPublicUrl(
      "https://photo.yupoo.com/lol2021/a/raw-a.jpg",
      "https://cdn.example.com",
    )).toBe(false)
  })

  test("rejects signed or query-string oss urls", () => {
    expect(isCanonicalAliyunOssPublicUrl(
      "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-hash.jpg?x-oss-signature=123",
      "https://cdn.example.com",
    )).toBe(false)
  })
})
