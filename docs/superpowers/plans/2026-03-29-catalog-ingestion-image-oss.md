# Catalog Ingestion Image OSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Yupoo album ingestion so `catalog_items.images_json` stores copied Aliyun OSS image URLs, with DOM-driven cover/gallery extraction and stable category-aware OSS paths.

**Architecture:** Keep the existing album/category skill entrypoints and persistence layer, but split image work into three focused stages: DOM-first source extraction, existing-category-context resolution, and synchronous OSS materialization. Preserve the current DB schema and `persistCatalogItem` flow; only feed it canonical OSS URLs plus stable category metadata so skip/update behavior remains predictable.

**Tech Stack:** Bun test runner, TypeScript, PostgreSQL (`pg`), Fetch API, Aliyun OSS SDK (`ali-oss`), existing catalog-ingestion CLI/skill entrypoints

---

## File Structure

### Files to modify
- `package.json` — add the Aliyun OSS dependency used by the uploader.
- `src/skills/catalogIngestion/types.ts` — split source-image and OSS-image contracts, and add resolved category context/materialization types.
- `src/skills/catalogIngestion/extractYupooAlbum.ts` — replace page-wide regex-first image assembly with DOM-first cover/gallery extraction, host validation, logical-image dedupe, and source-image ordering.
- `src/skills/catalogIngestion/normalizeYupooAlbum.ts` — accept resolved category context plus final OSS URLs, preserve image count semantics, and stop assuming `raw.imageUrls` is the persisted image list.
- `src/skills/catalogIngestion/runAlbumIngestion.ts` — wire the new context-resolution and OSS-materialization stages into the album ingest flow.
- `src/skills/catalogIngestion/catalogIngestion.test.ts` — convert parser coverage to the new DOM-first source-image contract and add OSS-persistence integration assertions.
- `src/skills/catalogIngestion/categoryIngestion.test.ts` — keep category-orchestration expectations aligned with category-context propagation.

### Files to create
- `src/skills/catalogIngestion/extractAlbumImageSources.ts` — focused DOM parser for cover/gallery image nodes, Yupoo-host validation, canonical source selection, and logical-image dedupe.
- `src/skills/catalogIngestion/extractAlbumImageSources.test.ts` — unit tests for selector behavior, non-Yupoo rejection, dedupe by Yupoo image identity, and cover-first ordering.
- `src/skills/catalogIngestion/loadExistingAlbumContext.ts` — load persisted category metadata for a previously ingested album so standalone re-runs reuse it.
- `src/skills/catalogIngestion/loadExistingAlbumContext.test.ts` — tests for context resolution precedence (`input.categoryContext`, persisted category context, `uncategorized`).
- `src/skills/catalogIngestion/materializeAlbumImagesToOss.ts` — validate OSS env, build deterministic object keys, download Yupoo bytes, upload to OSS, and return canonical public URLs.
- `src/skills/catalogIngestion/materializeAlbumImagesToOss.test.ts` — unit tests for env validation, key generation, unsigned public URL generation, batch failure behavior, and category-aware path rules.
- `src/skills/catalogIngestion/runAlbumIngestion.test.ts` — focused orchestration tests for fail-fast config validation, category-to-standalone stability, and no-partial-persistence behavior.

### Files intentionally left alone
- `src/skills/catalogIngestion/persistCatalogItem.ts` — keep the existing insert/update/skip implementation and content hash behavior; the new flow should work by changing its inputs, not by redesigning persistence.
- `src/db/schema.ts` — do not add columns or alter the schema.
- `src/skills/catalogIngestion/runCategoryIngestion.ts` — category orchestration already passes category context; avoid unnecessary restructuring.

## Task 1: Split image contracts and lock DOM-first source extraction

**Files:**
- Create: `src/skills/catalogIngestion/extractAlbumImageSources.ts`
- Create: `src/skills/catalogIngestion/extractAlbumImageSources.test.ts`
- Modify: `src/skills/catalogIngestion/types.ts`
- Modify: `src/skills/catalogIngestion/extractYupooAlbum.ts`
- Modify: `src/skills/catalogIngestion/catalogIngestion.test.ts`
- Test: `src/skills/catalogIngestion/extractAlbumImageSources.test.ts`
- Test: `src/skills/catalogIngestion/catalogIngestion.test.ts`

- [ ] **Step 1: Write the failing source-extraction tests**

```ts
import { describe, expect, test } from "bun:test"
import { extractAlbumImageSources } from "./extractAlbumImageSources"

describe("extractAlbumImageSources", () => {
  test("uses header image first and prefers data-origin-src over data-src over src", () => {
    const html = `
      <div class="showalbumheader__main">
        <img src="https://photo.yupoo.com/lol2021/cover-group/medium.jpg">
      </div>
      <div class="showalbum__parent">
        <img
          data-origin-src="https://photo.yupoo.com/lol2021/gallery-a/raw-a.jpg"
          data-src="https://photo.yupoo.com/lol2021/gallery-a/big.jpg"
          src="https://photo.yupoo.com/lol2021/gallery-a/small.jpg"
        >
      </div>
    `

    expect(extractAlbumImageSources(html)).toEqual({
      sourceImageUrls: [
        "https://photo.yupoo.com/lol2021/cover-group/medium.jpg",
        "https://photo.yupoo.com/lol2021/gallery-a/raw-a.jpg",
      ],
      logicalImageCount: 2,
    })
  })

  test("deduplicates cover and gallery variants by Yupoo image identity", () => {
    const html = `
      <div class="showalbumheader__main">
        <img src="https://photo.yupoo.com/lol2021/shared-group/medium.jpg">
      </div>
      <div class="showalbum__parent">
        <img data-src="https://photo.yupoo.com/lol2021/shared-group/big.jpg">
      </div>
    `

    expect(extractAlbumImageSources(html)).toEqual({
      sourceImageUrls: ["https://photo.yupoo.com/lol2021/shared-group/big.jpg"],
      logicalImageCount: 1,
    })
  })

  test("normalizes protocol-relative URLs and uses the first header image when multiple exist", () => {
    const html = `
      <div class="showalbumheader__main">
        <img src="//photo.yupoo.com/lol2021/cover-a/medium.jpg">
        <img src="https://photo.yupoo.com/lol2021/cover-b/medium.jpg">
      </div>
    `

    expect(extractAlbumImageSources(html)).toEqual({
      sourceImageUrls: ["https://photo.yupoo.com/lol2021/cover-a/medium.jpg"],
      logicalImageCount: 1,
    })
  })

  test("fails when the cover image is missing", () => {
    expect(() => extractAlbumImageSources('<div class="showalbum__parent"></div>')).toThrow("missing cover image")
  })

  test("fails when a selected image resolves to a non-Yupoo host", () => {
    const html = `
      <div class="showalbumheader__main">
        <img src="https://cdn.example.com/not-yupoo.jpg">
      </div>
    `

    expect(() => extractAlbumImageSources(html)).toThrow("image host must be photo.yupoo.com")
  })

  test("fails when a selected image URL is invalid", () => {
    const html = `
      <div class="showalbumheader__main">
        <img src="not a url">
      </div>
    `

    expect(() => extractAlbumImageSources(html)).toThrow("invalid image url")
  })
})
```

- [ ] **Step 2: Run the new source-extraction suite and confirm it fails**

Run: `bun test src/skills/catalogIngestion/extractAlbumImageSources.test.ts`
Expected: FAIL with missing file/export errors.

- [ ] **Step 3: Add the explicit image-source contracts to `types.ts`**

```ts
export type ExtractedAlbumImages = {
  sourceImageUrls: string[]
  logicalImageCount: number
}

export type RawYupooAlbum = {
  sourceUrl: string
  sourceSite: "yupoo"
  sourceType: "album"
  albumId: string
  shopName?: string
  owner?: string
  rawTitle: string
  rawDescription: string
  sourceImageUrls: string[]
  logicalImageCount: number
  datePublished?: string
  dateModified?: string
  rawJsonLd?: unknown
}
```

- [ ] **Step 4: Implement the focused DOM extractor**

```ts
function resolvePreferredSource(attrs: Record<string, string | undefined>) {
  return attrs["data-origin-src"] ?? attrs["data-src"] ?? attrs.src ?? ""
}

function imageIdentity(url: string) {
  const match = url.match(/^https:\/\/photo\.yupoo\.com\/([^/]+)\/([^/]+)\//)
  if (!match) throw new Error("image host must be photo.yupoo.com")
  return `${match[1]}/${match[2]}`
}

export function extractAlbumImageSources(html: string): ExtractedAlbumImages {
  // parse one header image, then all .showalbum__parent img nodes
  // normalize URLs, validate host, keep highest-priority URL per Yupoo identity
  // preserve first logical position in output order
}
```

- [ ] **Step 5: Rewire `extractYupooAlbum.ts` to use the new extractor**

```ts
const extractedImages = extractAlbumImageSources(html)

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
```

- [ ] **Step 6: Update the existing catalog-ingestion parser tests**

```ts
expect(raw.sourceImageUrls).toEqual([
  "https://photo.yupoo.com/lol2021/cover-group/big.jpg",
  "https://photo.yupoo.com/lol2021/gallery-a/raw-a.jpg",
])
expect(raw.logicalImageCount).toBe(2)
```

- [ ] **Step 7: Run the focused parser tests**

Run: `bun test src/skills/catalogIngestion/extractAlbumImageSources.test.ts src/skills/catalogIngestion/catalogIngestion.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/skills/catalogIngestion/types.ts src/skills/catalogIngestion/extractAlbumImageSources.ts src/skills/catalogIngestion/extractAlbumImageSources.test.ts src/skills/catalogIngestion/extractYupooAlbum.ts src/skills/catalogIngestion/catalogIngestion.test.ts
git commit -m "feat: extract yupoo album images from dom"
```

## Task 2: Add category-context resolution for stable standalone re-ingests

**Files:**
- Create: `src/skills/catalogIngestion/loadExistingAlbumContext.ts`
- Create: `src/skills/catalogIngestion/loadExistingAlbumContext.test.ts`
- Modify: `src/skills/catalogIngestion/types.ts`
- Modify: `src/skills/catalogIngestion/normalizeYupooAlbum.ts`
- Modify: `src/skills/catalogIngestion/runAlbumIngestion.ts`
- Test: `src/skills/catalogIngestion/loadExistingAlbumContext.test.ts`
- Test: `src/skills/catalogIngestion/runAlbumIngestion.test.ts`

- [ ] **Step 1: Write failing tests for context precedence and metadata reuse**

```ts
import { describe, expect, test } from "bun:test"
import { resolveAlbumCategoryContext } from "./loadExistingAlbumContext"

describe("resolveAlbumCategoryContext", () => {
  test("prefers current category context over persisted context", async () => {
    const resolved = await resolveAlbumCategoryContext({
      albumId: "230153753",
      inputCategoryContext: {
        categoryId: "4372478",
        categoryTitle: "【乔丹1代系列】",
        categoryUrl: "https://lol2021.x.yupoo.com/categories/4372478",
      },
      loadExisting: async () => ({
        categoryId: "old",
        categoryTitle: "old",
        categoryUrl: "old",
      }),
    })

    expect(resolved.categoryId).toBe("4372478")
  })

  test("reuses persisted category context for standalone re-ingest", async () => {
    const resolved = await resolveAlbumCategoryContext({
      albumId: "230153753",
      inputCategoryContext: undefined,
      loadExisting: async () => ({
        categoryId: "4372478",
        categoryTitle: "【乔丹1代系列】",
        categoryUrl: "https://lol2021.x.yupoo.com/categories/4372478",
      }),
    })

    expect(resolved.categoryId).toBe("4372478")
    expect(resolved.storageCategoryId).toBe("4372478")
  })
})
```

- [ ] **Step 2: Run the context tests and confirm they fail**

Run: `bun test src/skills/catalogIngestion/loadExistingAlbumContext.test.ts`
Expected: FAIL with missing file/export errors.

- [ ] **Step 3: Add the resolved-context types**

```ts
export type ResolvedAlbumCategoryContext = {
  categoryId?: string
  categoryTitle?: string
  categoryUrl?: string
  storageCategoryId: string
}
```

- [ ] **Step 4: Implement the existing-context loader**

```ts
export async function loadExistingAlbumContext(albumId: string) {
  const db = await ensureCatalogSchema()
  const result = await db.query(`
    SELECT extra_json
    FROM catalog_items
    WHERE source_site = 'yupoo' AND source_type = 'album' AND source_id = $1
    LIMIT 1
  `, [albumId])

  // parse extra_json.category_id/title/url and return undefined when missing
}

export async function resolveAlbumCategoryContext(args: {
  albumId: string
  inputCategoryContext?: CategoryContext
  loadExisting?: (albumId: string) => Promise<CategoryContext | undefined>
}): Promise<ResolvedAlbumCategoryContext> {
  // current category context wins; otherwise reuse persisted context; otherwise storageCategoryId = "uncategorized"
}
```

- [ ] **Step 5: Update normalization to accept resolved context and explicit OSS URLs**

```ts
export function normalizeYupooAlbum(
  raw: RawYupooAlbum,
  ossImageUrls: string[],
  resolvedCategoryContext: ResolvedAlbumCategoryContext,
): CatalogItem {
  return {
    // ...
    images: ossImageUrls,
    extra: {
      // ...
      image_count: raw.logicalImageCount,
      category_id: resolvedCategoryContext.categoryId ?? null,
      category_title: resolvedCategoryContext.categoryTitle ?? null,
      category_url: resolvedCategoryContext.categoryUrl ?? null,
    },
  }
}
```

- [ ] **Step 6: Add the orchestration test for category -> standalone stability**

```ts
test("standalone re-ingest reuses persisted category context", async () => {
  const result = await runAlbumIngestion(
    { mode: "album", url: ALBUM_URL },
    {
      extractAlbum: async () => rawAlbum,
      resolveCategoryContext: async () => ({
        categoryId: "4372478",
        categoryTitle: "【乔丹1代系列】",
        categoryUrl: CATEGORY_URL,
        storageCategoryId: "4372478",
      }),
      materializeImages: async () => ["https://img.example/4372478/230153753/00-cover.jpg"],
      persistItem: async (item) => {
        expect(item.extra.category_id).toBe("4372478")
        return { action: "skipped", itemId: 1 }
      },
    },
  )

  expect(result.status).toBe("success")
  expect(result.skipped).toBe(1)
})
```

- [ ] **Step 7: Run the context-resolution tests**

Run: `bun test src/skills/catalogIngestion/loadExistingAlbumContext.test.ts src/skills/catalogIngestion/runAlbumIngestion.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/skills/catalogIngestion/types.ts src/skills/catalogIngestion/loadExistingAlbumContext.ts src/skills/catalogIngestion/loadExistingAlbumContext.test.ts src/skills/catalogIngestion/normalizeYupooAlbum.ts src/skills/catalogIngestion/runAlbumIngestion.ts src/skills/catalogIngestion/runAlbumIngestion.test.ts
git commit -m "feat: preserve category context for album image ingestion"
```

## Task 3: Add Aliyun OSS materialization with deterministic public URLs

**Files:**
- Modify: `package.json`
- Create: `src/skills/catalogIngestion/materializeAlbumImagesToOss.ts`
- Create: `src/skills/catalogIngestion/materializeAlbumImagesToOss.test.ts`
- Modify: `src/skills/catalogIngestion/types.ts`
- Test: `src/skills/catalogIngestion/materializeAlbumImagesToOss.test.ts`

- [ ] **Step 1: Write failing tests for env validation, extension rules, and deterministic key generation**

```ts
import { describe, expect, test, mock } from "bun:test"
import {
  buildAlbumImageObjectKey,
  buildPublicOssUrl,
  assertOssConfig,
  resolveImageExtension,
  materializeAlbumImagesToOss,
} from "./materializeAlbumImagesToOss"

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
})
```

- [ ] **Step 2: Run the uploader tests and confirm they fail**

Run: `bun test src/skills/catalogIngestion/materializeAlbumImagesToOss.test.ts`
Expected: FAIL with missing file/export errors.

- [ ] **Step 3: Add the OSS dependency**

```json
{
  "dependencies": {
    "ali-oss": "^6.22.0",
    "exceljs": "^4.4.0",
    "pg": "^8.20.0"
  }
}
```

- [ ] **Step 4: Implement env validation and pure key/public-URL helpers**

```ts
export function assertOssConfig(env: NodeJS.ProcessEnv) {
  const required = [
    "ALIYUN_OSS_REGION",
    "ALIYUN_OSS_BUCKET",
    "ALIYUN_OSS_ENDPOINT",
    "ALIYUN_OSS_ACCESS_KEY_ID",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "ALIYUN_OSS_PUBLIC_BASE_URL",
  ]

  for (const key of required) {
    if (!env[key]?.trim()) throw new Error(`missing OSS configuration: ${key}`)
  }
}

export function resolveImageExtension(sourceImageUrl: string, contentType: string | null) {
  // allow only jpg/jpeg/png/webp/gif from the source URL
  // otherwise map image/jpeg,image/png,image/webp,image/gif from Content-Type
  // otherwise return "jpg"
}

export function buildAlbumImageObjectKey(args: {
  storageCategoryId: string
  albumId: string
  index: number
  sourceImageUrl: string
  contentType?: string | null
}) {
  // zero-pad index, sha1(sourceImageUrl), derive extension with resolveImageExtension
}
```

- [ ] **Step 5: Re-run the pure helper tests before touching the uploader loop**

Run: `bun test src/skills/catalogIngestion/materializeAlbumImagesToOss.test.ts -t "resolveImageExtension|buildAlbumImageObjectKey|buildPublicOssUrl|assertOssConfig"`
Expected: PASS for the pure helper cases, while batch-upload tests still fail.

- [ ] **Step 6: Add the failing batch-upload tests for all-or-nothing behavior**

```ts
test("fails the batch when any upload fails", async () => {
  await expect(materializeAlbumImagesToOss({
    albumId: "230153753",
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
```

- [ ] **Step 7: Implement batch upload orchestration**

```ts
export async function materializeAlbumImagesToOss(args: {
  albumId: string
  storageCategoryId: string
  sourceImageUrls: string[]
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  createClient?: (config: OssConfig) => { put: (key: string, body: Buffer, options: { headers: { "Content-Type": string } }) => Promise<unknown> }
}) {
  assertOssConfig(args.env ?? process.env)

  const urls: string[] = []

  for (const [index, sourceImageUrl] of args.sourceImageUrls.entries()) {
    // fetch bytes, derive content type, upload, push canonical public URL
  }

  return urls
}
```

- [ ] **Step 8: Run the uploader tests**

Run: `bun test src/skills/catalogIngestion/materializeAlbumImagesToOss.test.ts`
Expected: PASS.

- [ ] **Step 9: Install dependencies and refresh the lockfile**

Run: `bun install`
Expected: PASS and `package.json`/`bun.lock` updated for `ali-oss`.

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lock src/skills/catalogIngestion/types.ts src/skills/catalogIngestion/materializeAlbumImagesToOss.ts src/skills/catalogIngestion/materializeAlbumImagesToOss.test.ts
git commit -m "feat: add aliyun oss image materialization"
```

## Task 4: Wire album ingestion end-to-end and lock regression coverage

**Files:**
- Modify: `src/skills/catalogIngestion/runAlbumIngestion.ts`
- Modify: `src/skills/catalogIngestion/catalogIngestion.test.ts`
- Modify: `src/skills/catalogIngestion/categoryIngestion.test.ts`
- Modify: `src/skills/catalogIngestion/runAlbumIngestion.test.ts`
- Test: `src/skills/catalogIngestion/runAlbumIngestion.test.ts`
- Test: `src/skills/catalogIngestion/catalogIngestion.test.ts`
- Test: `src/skills/catalogIngestion/categoryIngestion.test.ts`

- [ ] **Step 1: Add failing orchestration tests for fail-fast config and OSS persistence**

```ts
test("returns error before persistence when OSS configuration is missing", async () => {
  const result = await runAlbumIngestion(
    { mode: "album", url: ALBUM_URL },
    {
      extractAlbum: async () => rawAlbum,
      resolveCategoryContext: async () => ({ storageCategoryId: "uncategorized" }),
      materializeImages: async () => { throw new Error("missing OSS configuration: ALIYUN_OSS_BUCKET") },
      persistItem: async () => {
        throw new Error("should not persist")
      },
    },
  )

  expect(result.status).toBe("error")
  expect(result.error).toContain("ALIYUN_OSS_BUCKET")
})

test("persists OSS URLs instead of source URLs", async () => {
  const persisted: string[][] = []

  const result = await runAlbumIngestion(
    { mode: "album", url: ALBUM_URL },
    {
      extractAlbum: async () => rawAlbum,
      resolveCategoryContext: async () => ({ storageCategoryId: "4372478" }),
      materializeImages: async () => [
        "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-cover.jpg",
        "https://cdn.example.com/catalog/yupoo/4372478/230153753/01-gallery.jpg",
      ],
      persistItem: async (item) => {
        persisted.push(item.images)
        return { action: "inserted", itemId: 1 }
      },
    },
  )

  expect(result.status).toBe("success")
  expect(persisted[0][0]).toContain("cdn.example.com/catalog/yupoo/4372478")
})

test("marks the album as updated when the final OSS image set changes", async () => {
  const persistItem = mock(async (item) => {
    if (item.images[1]?.includes("gallery-b")) {
      return { action: "updated", itemId: 1 }
    }

    return { action: "inserted", itemId: 1 }
  })

  await runAlbumIngestion({ mode: "album", url: ALBUM_URL }, {
    extractAlbum: async () => rawAlbum,
    resolveCategoryContext: async () => ({ storageCategoryId: "4372478" }),
    materializeImages: async () => [
      "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-cover.jpg",
      "https://cdn.example.com/catalog/yupoo/4372478/230153753/01-gallery-a.jpg",
    ],
    persistItem,
  })

  const changed = await runAlbumIngestion({ mode: "album", url: ALBUM_URL }, {
    extractAlbum: async () => ({ ...rawAlbum, sourceImageUrls: ["cover", "gallery-b"] }),
    resolveCategoryContext: async () => ({ storageCategoryId: "4372478" }),
    materializeImages: async () => [
      "https://cdn.example.com/catalog/yupoo/4372478/230153753/00-cover.jpg",
      "https://cdn.example.com/catalog/yupoo/4372478/230153753/01-gallery-b.jpg",
    ],
    persistItem,
  })

  expect(changed.updated).toBe(1)
})
```

- [ ] **Step 2: Run the orchestration tests and confirm they fail**

Run: `bun test src/skills/catalogIngestion/runAlbumIngestion.test.ts`
Expected: FAIL until the new dependency-injected flow exists.

- [ ] **Step 3: Refactor `runAlbumIngestion` to inject the new stages**

```ts
function defaultDeps(): AlbumIngestionDeps {
  return {
    extractAlbum: extractYupooAlbum,
    resolveCategoryContext: ({ albumId, inputCategoryContext }) =>
      resolveAlbumCategoryContext({ albumId, inputCategoryContext }),
    materializeImages: ({ albumId, storageCategoryId, sourceImageUrls }) =>
      materializeAlbumImagesToOss({ albumId, storageCategoryId, sourceImageUrls }),
    persistItem: persistCatalogItem,
  }
}

export async function runAlbumIngestion(input: CatalogIngestionInput, deps = defaultDeps()) {
  // extract raw album
  // resolve category context
  // materialize sourceImageUrls to OSS URLs
  // normalize with ossImageUrls + resolved context
  // persist and return inserted/updated/skipped summary
}
```

- [ ] **Step 4: Extend `catalogIngestion.test.ts` to assert real persisted `images_json` behavior**

```ts
const records = await listCatalogItems({ sourceIds: ["225167978"] })
expect(records[0].images).toEqual([
  "https://cdn.example.com/catalog/yupoo/4372478/225167978/00-cover.jpg",
  "https://cdn.example.com/catalog/yupoo/4372478/225167978/01-gallery.jpg",
])
```

- [ ] **Step 5: Add the category regression test that standalone re-runs do not clear metadata**

```ts
test("standalone re-run after category ingest keeps category metadata stable", async () => {
  // first persist a category-scoped album
  // then re-run standalone with resolved persisted context
  // assert category_id/title/url stay unchanged and result can be skipped
})
```

- [ ] **Step 6: Add the changed-image integration test in `catalogIngestion.test.ts`**

```ts
test("updates an existing catalog item when the normalized oss image list changes", async () => {
  // persist once with cover + gallery-a
  // persist again with cover + gallery-b
  // expect the second persist result to be "updated"
})
```

- [ ] **Step 7: Run the focused catalog-ingestion suites**

Run: `bun test src/skills/catalogIngestion`
Expected: PASS.

- [ ] **Step 8: Run the full project test suite**

Run: `bun test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/skills/catalogIngestion/runAlbumIngestion.ts src/skills/catalogIngestion/runAlbumIngestion.test.ts src/skills/catalogIngestion/catalogIngestion.test.ts src/skills/catalogIngestion/categoryIngestion.test.ts
git commit -m "feat: persist oss images for catalog ingestion"
```

## Task 5: Final verification and handoff

**Files:**
- Test: `src/skills/catalogIngestion/extractAlbumImageSources.test.ts`
- Test: `src/skills/catalogIngestion/loadExistingAlbumContext.test.ts`
- Test: `src/skills/catalogIngestion/materializeAlbumImagesToOss.test.ts`
- Test: `src/skills/catalogIngestion/runAlbumIngestion.test.ts`
- Test: `src/skills/catalogIngestion/catalogIngestion.test.ts`
- Test: `src/skills/catalogIngestion/categoryIngestion.test.ts`

- [ ] **Step 1: Re-run the targeted catalog-ingestion tests in one command**

Run: `bun test src/skills/catalogIngestion`
Expected: PASS.

- [ ] **Step 2: Re-run the full suite to catch regressions outside catalog ingestion**

Run: `bun test`
Expected: PASS.

- [ ] **Step 3: Manually verify the implementation contract in code review**

Check:
- `images_json` is fed only OSS URLs
- source-vs-OSS image contracts are explicit in types
- standalone re-runs reuse persisted category metadata
- uploader fails fast on missing OSS env
- changed image sets trigger `updated`
- no schema changes slipped in

- [ ] **Step 4: Stop here unless a specific follow-up fix is needed**

If review finds no issues, do not create an extra catch-all commit. If a tiny follow-up is required, stage only the exact files you touched in that follow-up commit.

Example:

```bash
git add src/skills/catalogIngestion/runAlbumIngestion.test.ts

git commit -m "test: tighten catalog ingestion oss regression coverage"
```
