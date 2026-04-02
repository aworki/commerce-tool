import { describe, expect, test } from "bun:test"
import { extractAlbumImageSources } from "./extractAlbumImageSources.ts"

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
      <div class="showalbum__parent">
        <img data-src="//photo.yupoo.com/lol2021/gallery-a/big.jpg">
      </div>
    `

    expect(extractAlbumImageSources(html)).toEqual({
      sourceImageUrls: [
        "https://photo.yupoo.com/lol2021/cover-a/medium.jpg",
        "https://photo.yupoo.com/lol2021/gallery-a/big.jpg",
      ],
      logicalImageCount: 2,
    })
  })

  test("extracts cover from nested header markup and all gallery children", () => {
    const html = `
      <div class="showalbumheader__main">
        <div class="yupoo-crumbs showalbumheader__header">
          <a href="/categories/5057073">【黑5专区】</a>
        </div>
        <div class="showalbumheader__gallerycover">
          <img class="autocover" src="https://photo.yupoo.com/lol2021/c612e8c1/medium.jpg">
          <noscript>
            <img src="https://photo.yupoo.com/lol2021/c612e8c1/medium.jpg">
          </noscript>
          <div class="showalbumheader__space"></div>
        </div>
        <div class="showalbumheader__gallerydec"></div>
      </div>
      <div class="showalbum__parent">
        <div class="showalbum__children image__main">
          <div class="image__imagewrap" data-type="photo">
            <img
              class="autocover image__img image__landscape"
              data-src="https://photo.yupoo.com/lol2021/68894ad9/big.jpg"
              data-origin-src="https://photo.yupoo.com/lol2021/68894ad9/05306d31.jpg"
              src="https://photo.yupoo.com/lol2021/68894ad9/small.jpg"
            >
          </div>
        </div>
        <div class="showalbum__children image__main">
          <div class="image__imagewrap" data-type="photo">
            <img
              class="autocover image__img image__landscape"
              data-src="https://photo.yupoo.com/lol2021/d508d817/big.jpg"
              data-origin-src="https://photo.yupoo.com/lol2021/d508d817/db272910.jpg"
              src="https://photo.yupoo.com/lol2021/d508d817/small.jpg"
            >
          </div>
        </div>
      </div>
    `

    expect(extractAlbumImageSources(html)).toEqual({
      sourceImageUrls: [
        "https://photo.yupoo.com/lol2021/c612e8c1/medium.jpg",
        "https://photo.yupoo.com/lol2021/68894ad9/05306d31.jpg",
        "https://photo.yupoo.com/lol2021/d508d817/db272910.jpg",
      ],
      logicalImageCount: 3,
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
