# Catalog Ingestion Image OSS Design

Status: Approved in brainstorming
Date: 2026-03-29

## Summary

Update the Yupoo catalog-ingestion image pipeline so `catalog_items.images_json` stores self-hosted Aliyun OSS image URLs instead of direct Yupoo image URLs.

Image extraction must stop relying on global page-wide regex matching as the primary source. The parser must read the real album DOM structure, treat the header image as the cover image, treat the album grid images as the gallery images, download each Yupoo image, upload a copied version to OSS during album ingest, and persist only the resulting OSS URLs.

This change is intentionally narrow at the schema and workflow level: it does not add columns or change non-image business rules, but it does intentionally change the persisted image-derived payloads that are coupled to image extraction, including `images_json`, `extra_json.image_count`, and the resulting `content_hash` values.

The downstream export contract is also explicit: `catalog_items.images_json` becomes the single source of truth for workbook image cells, and `shoes-transformer` must only export canonical OSS public URLs from the database. Export does not upload, rewrite, or repair image URLs at export time.

## Goals

- Persist OSS-hosted image URLs in `catalog_items.images_json`.
- Extract the cover image from `.showalbumheader__main img`.
- Extract gallery images from `.showalbum__parent img`.
- Prefer `data-origin-src` over `data-src` over `src` for each image node.
- Accept only Yupoo-hosted source images for this flow.
- Preserve image order: cover first, then gallery images in DOM order.
- Upload images to OSS synchronously during album ingest.
- Use deterministic OSS object keys so repeated ingests are stable.
- Fail the album ingest if any required image cannot be copied to OSS.

## Non-goals

- Changing the `catalog_items` table schema.
- Adding new columns beyond the existing `images_json` field.
- Changing title, description, or other non-image album metadata rules.
- Adding an asynchronous image backfill job.
- Persisting both Yupoo URLs and OSS URLs in parallel as the primary contract.
- Supporting non-Yupoo image sources.
- Deleting superseded OSS objects during ingest.

## Existing Constraints

Current behavior:

- `src/skills/catalogIngestion/extractYupooAlbum.ts` merges JSON-LD images with page-wide regex matches for `photo.yupoo.com` URLs.
- `src/skills/catalogIngestion/normalizeYupooAlbum.ts` forwards `raw.imageUrls` directly into `CatalogItem.images` and also derives `extra.image_count` from `raw.imageUrls.length`.
- `src/skills/catalogIngestion/persistCatalogItem.ts` serializes `CatalogItem.images` into `images_json` and includes both `images` and `extra` in the content hash.
- `src/db/schema.ts` defines `images_json TEXT NOT NULL` and should remain unchanged.

This means the correct place to change behavior is before normalization/persistence: convert extracted Yupoo source images into OSS URLs, then let the existing persistence path keep working.

## Confirmed Yupoo DOM Contract

The target album page structure was validated against a live Yupoo album.

### Cover image

The cover image comes from:

```text
.showalbumheader__main img
```

Observed behavior:

- header image `src` is typically a `medium.jpg` URL
- the header section represents the single lead image for the album

### Gallery images

The rest of the album images come from:

```text
.showalbum__parent img
```

Observed behavior:

- grid image `src` is typically a `small.jpg` URL
- each image node can also expose richer attributes such as:
  - `data-origin-src` (preferred)
  - `data-src` (usually `big.jpg`)
  - `src` (fallback)

## Extraction Contract

Image extraction will become DOM-first and explicit.

### Cover selection

Resolve the cover image from `.showalbumheader__main img` using these rules:

- if exactly one matching `img` is found, use it
- if no matching `img` is found, fail the album ingest
- if multiple matching `img` nodes are found, use the first one in DOM order and treat the rest as irrelevant header noise rather than gallery images

### Gallery selection

Extract zero or more gallery candidates from `.showalbum__parent img` in document order.

### Per-node source URL priority

For every selected `img` node, resolve the source URL using:

1. `data-origin-src`
2. `data-src`
3. `src`

Normalization requirements:

- trim whitespace
- convert protocol-relative URLs (`//...`) to `https://...`
- reject empty values
- require the final resolved host to be `photo.yupoo.com`

If a selected cover/gallery image node resolves to a non-Yupoo host or an invalid URL, fail the album ingest. This design only supports Yupoo-hosted album images.

### Source URL contract

The parser output must distinguish source image URLs from OSS image URLs.

- `extractYupooAlbum` returns ordered `sourceImageUrls`
- `materializeAlbumImagesToOss` consumes `sourceImageUrls` and returns ordered `ossImageUrls`
- `normalizeYupooAlbum` must receive both the raw album data and the final ordered `ossImageUrls`
- `extra.image_count` is derived from the count of logical source images after extraction/deduplication, not by re-counting persisted OSS URLs independently

The implementation may choose exact type names, but the source-vs-OSS distinction must be explicit in code and tests.

### Final image ordering

The final ordered source image list is:

1. cover image first
2. gallery images after that, in DOM order

### De-duplication

De-duplicate by Yupoo image identity, not by exact URL string equality.

Identity rule:

- when the URL matches `photo.yupoo.com/{owner}/{group}/{file}`, treat `{owner}/{group}` as the logical image identity
- prefer the highest-priority source candidate for that identity (`data-origin-src` > `data-src` > `src`)
- if the header cover and a gallery node point at different size variants of the same identity, keep one logical image only
- preserve the first logical position of that image in the final ordered list

This is required because Yupoo commonly exposes the same photo through multiple size-specific URLs.

### Missing/empty gallery behavior

- a missing cover image is fatal
- an album with zero resolved images after cover/gallery extraction is fatal
- empty or unusable gallery nodes are ignored unless they leave the album with no resolved images
- a present cover with zero additional gallery images is allowed

These rules preserve the current expectation that an album without any usable images is invalid while making the cover requirement explicit.

## Category Context Resolution Contract

Standalone album ingests and category-based album ingests write to the same `catalog_items` row, keyed by album identity. To keep that row stable, category context resolution must be deterministic.

Resolved category context for a given album is determined in this order:

1. current `input.categoryContext` when the album is being ingested from a category workflow
2. the existing persisted `extra_json.category_id`, `category_title`, and `category_url` for the same album row, when the current ingest is standalone and the row already exists
3. no category context, which maps to `uncategorized`

Behavior requirements:

- standalone re-ingest must reuse the full previously persisted category context when it exists
- standalone re-ingest must not clear `extra_json.category_*` fields that were already learned from a previous category ingest
- category workflow ingest may upgrade an existing standalone album from `uncategorized` to a real category context
- category workflow ingest remains the authoritative source when current category context is present

This rule is required so the same unchanged album does not churn between different OSS prefixes or metadata payloads depending only on entrypoint.

## OSS Copy Contract

Album ingest must materialize each extracted source image into OSS before normalization and persistence.

### Execution model

For each extracted image:

1. download the Yupoo source image
2. upload the downloaded bytes to Aliyun OSS
3. obtain the final OSS URL
4. place that OSS URL into the ordered image list

This happens synchronously inside the album-ingest flow.

### Failure model

Use all-or-nothing semantics.

- If any required image download fails, the album ingest fails.
- If any OSS upload fails, the album ingest fails.
- Do not persist a partially uploaded `images_json` list.

This keeps `images_json` simple: either it contains a complete ordered set of OSS URLs or the album ingestion returns an error.

## OSS Object Key Contract

OSS object keys must be deterministic.

### Key format

```text
catalog/yupoo/{resolvedCategoryId}/{albumId}/{index}-{sha1(sourceImageUrl)}.{ext}
```

Where:

- `resolvedCategoryId` follows the category-context resolution contract above
- `albumId` comes from the Yupoo album URL
- `index` is zero-padded by position in the final ordered image list (`00`, `01`, `02`, ...)
- `sha1(sourceImageUrl)` stabilizes the key for the exact source image
- `{ext}` is resolved in this order:
  1. file extension parsed from the final source image URL path when it is a safe image extension
  2. extension derived from the download response `Content-Type`
  3. `jpg` fallback

Safe image extensions for this contract are `jpg`, `jpeg`, `png`, `webp`, and `gif`.

### Direct album ingest without category context

When ingesting a standalone album URL without category context and there is no existing persisted category id for that album, use:

```text
catalog/yupoo/uncategorized/{albumId}/{index}-{sha1(sourceImageUrl)}.{ext}
```

### Cross-mode stability rule

The same album row must not oscillate between category-specific and `uncategorized` prefixes purely because the user chose a different ingest entrypoint.

Rules:

- category-based ingest is authoritative when it provides a category id
- standalone album ingest may use `uncategorized` only when the album has no current category context and no previously persisted category id
- if an album was first ingested as standalone and later ingested through a category workflow, rewriting OSS paths from `uncategorized` to the real category id is expected and allowed
- once an album row already has a persisted category id, later standalone ingests must reuse that resolved category id instead of rewriting the same unchanged album back to `uncategorized`

### Object lifecycle rule

When an album is upgraded from `uncategorized` paths to category-specific paths, the ingest may leave the old OSS objects in place.

Rules:

- successful persistence updates only the database row to point at the new canonical OSS URLs
- the ingest flow does not delete or move previously uploaded OSS objects
- any future cleanup of superseded OSS objects is out of scope for this design and must be handled by a separate maintenance workflow if desired

This keeps the ingestion path simple and avoids adding destructive object-management steps to the synchronous ingest flow.

### Persisted URL format

`images_json` must store the final canonical public OSS object URLs with no signed query parameters.

Template:

```text
{publicBaseUrl}/catalog/yupoo/{resolvedCategoryId}/{albumId}/{index}-{sha1(sourceImageUrl)}.{ext}
```

Requirements:

- `publicBaseUrl` is one configured stable origin for this project
- persisted URLs must be plain object URLs, not temporary signed URLs
- persisted URLs must not contain time-varying query strings that would break idempotence

### Why deterministic keys

Deterministic keys preserve idempotence:

- repeated ingests of the same album generate the same OSS paths
- unchanged image sets keep the same `images_json` values
- existing `content_hash` logic can continue to determine inserted/updated/skipped behavior without schema changes

## Proposed Flow Change

Current album flow:

```text
extractYupooAlbum
-> normalizeYupooAlbum
-> persistCatalogItem
```

Proposed album flow:

```text
extractYupooAlbum
-> resolveExistingAlbumContext
-> materializeAlbumImagesToOss
-> normalizeYupooAlbum
-> persistCatalogItem
```

### Responsibility split

- `extractYupooAlbum`
  - parse album metadata
  - parse DOM image nodes
  - return the ordered `sourceImageUrls`
- `resolveExistingAlbumContext`
  - load the existing row for the same album, when present
  - reuse persisted category context during standalone re-ingest
  - provide the resolved category context used for both OSS pathing and normalization
- `materializeAlbumImagesToOss`
  - download each source image
  - upload to OSS with deterministic keys
  - return the ordered `ossImageUrls`
- `normalizeYupooAlbum`
  - map normalized album data into `CatalogItem`
  - reuse resolved persisted category context when current input does not provide one
  - persist `ossImageUrls` as `CatalogItem.images`
  - compute `extra.image_count` from the logical source image count, not from a second parse of persisted OSS URLs
- `persistCatalogItem`
  - serialize `CatalogItem.images` into `images_json`
  - preserve existing hashing and insert/update/skip behavior
  - avoid metadata churn for unchanged standalone re-ingests of previously categorized albums

This keeps the schema and persistence layer unchanged while swapping the source of truth for image URLs.

## Runtime Configuration Contract

OSS integration will use one explicit environment-based contract, following the repository's existing `DATABASE_URL` pattern.

Required environment variables:

- `ALIYUN_OSS_REGION`
- `ALIYUN_OSS_BUCKET`
- `ALIYUN_OSS_ENDPOINT`
- `ALIYUN_OSS_ACCESS_KEY_ID`
- `ALIYUN_OSS_ACCESS_KEY_SECRET`
- `ALIYUN_OSS_PUBLIC_BASE_URL`

Behavior requirements:

- album ingest must fail fast before any image upload work starts if any required OSS variable is missing or blank
- `ALIYUN_OSS_PUBLIC_BASE_URL` is the exact `publicBaseUrl` used to build canonical persisted URLs
- the uploader must use one fixed OSS client implementation for the project; this design assumes an SDK/client path that uploads objects directly to Aliyun OSS rather than storing temporary signed URLs in the database
- persisted `images_json` values must never depend on request-time signatures, expirations, or caller identity

This removes configuration ambiguity from the implementation plan.

## Proposed Dependency Addition

Implementation should add one explicit OSS client dependency for Node/Bun integration.

Chosen dependency for this design:

- `ali-oss`

The implementation plan may decide exact module boundaries, but it should not replace the OSS client contract with ad-hoc upload requests.

## Data Contract Changes

### What changes

- the raw album extraction contract now carries ordered `sourceImageUrls`
- the upload/materialization step produces ordered `ossImageUrls`
- by the time `CatalogItem.images` reaches persistence, it must contain OSS URLs only
- `normalizeYupooAlbum` must consume both the raw album data and the final OSS URL list
- because `normalizeYupooAlbum` also derives `extra.image_count` from the logical source image count, the persisted `extra_json` payload and `content_hash` may change when image extraction and deduplication change
- standalone re-ingest of an already categorized album must preserve the previously learned category metadata instead of clearing it

### What stays the same

- `CatalogItem.images` remains a `string[]`
- `persistCatalogItem` still writes `JSON.stringify(item.images)` into `images_json`
- `persistCatalogItem` still hashes `title`, `description`, `images`, and `extra`
- no schema changes are required
- no non-image business fields gain new meaning
- existing category metadata fields continue to serve the same purpose they serve today

## Removal of Global Regex as Primary Logic

The existing page-wide regex image sweep should no longer drive the final image list.

Reasons:

- it does not understand the semantic difference between header cover and gallery images
- it can pick up images from unrelated parts of the page such as share widgets or duplicated references
- it cannot reliably prefer `data-origin-src`
- it makes final ordering depend on incidental HTML text order rather than the true album DOM structure

If any regex-based fallback is retained for defensive parsing, it must not override the DOM-derived cover/gallery contract.

## Testing Plan

### 1. DOM extraction tests

Update catalog ingestion parsing tests to cover:

- cover image is extracted only from `.showalbumheader__main img`
- gallery images are extracted from `.showalbum__parent img`
- `data-origin-src` wins over `data-src`, which wins over `src`
- non-Yupoo image hosts are rejected
- cover image is first in the final ordered list
- gallery image order matches DOM order
- cover=`medium.jpg` and gallery=`big.jpg` for the same Yupoo image identity collapse to one logical image
- duplicate logical identities are collapsed while preserving first position
- missing `.showalbumheader__main img` is fatal

### 2. OSS materialization tests

Add unit tests for the image materialization step:

- `sourceImageUrls` -> deterministic OSS keys
- repeated runs produce the same keys
- direct album ingests use `uncategorized` as the path segment only when no category context exists and no persisted category id already exists for the album
- category-based ingests use the real category id in the path
- later standalone ingests reuse an already persisted category id instead of oscillating back to `uncategorized`
- persisted URLs are canonical unsigned public URLs with no time-varying query params
- one failed download/upload fails the whole batch

### 3. Album ingest integration tests

Add or update album-ingest tests to cover:

- final persisted `images_json` contains OSS URLs, not Yupoo URLs
- category ingest followed by unchanged standalone ingest is skipped and does not clear `extra_json.category_*`
- repeated identical ingests can still be skipped
- changed image order or changed source image set causes an update
- partial upload failure does not persist a half-complete image list
- missing required OSS configuration fails fast before upload work starts

## Acceptance Criteria

The change is complete when all of the following are true:

- ingesting a Yupoo album stores only OSS URLs in `catalog_items.images_json`
- the first stored image is the header cover image
- the remaining stored images come from `.showalbum__parent img` in DOM order
- every stored image was downloaded from Yupoo and copied to OSS during ingest
- standalone album ingest paths use `uncategorized` only when neither current input nor persisted album state provides a category id
- category ingest paths include the real category id before the album id
- once a category id has been persisted for an album, later standalone ingests reuse it instead of rewriting unchanged images back to `uncategorized`
- persisted `images_json` URLs are canonical unsigned public object URLs with no time-varying query parameters
- a single failed image copy causes the album ingest to fail without partial image persistence
- repeated ingests of unchanged input remain idempotent
- missing `.showalbumheader__main img` causes the album ingest to fail
- non-Yupoo cover/gallery image URLs cause the album ingest to fail
- missing required OSS environment variables causes the album ingest to fail fast before upload work starts
