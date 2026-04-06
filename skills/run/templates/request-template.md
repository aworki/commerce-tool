# run request template

Use one of these request shapes.

## 1. Ingest a Yupoo album into the local database
```text
把这个 Yupoo album 落到默认数据库：https://lol2021.x.yupoo.com/albums/225167978?uid=1&isSubCate=false
```

## 2. Inspect a Yupoo category, then ingest with a positive limit
```text
先看看这个分类大概有多少，再按前 50 条抓取并落库：https://lol2021.x.yupoo.com/categories/4372478
```

## 3. Export already-crawled shoes from the local database
```text
--category-url https://lol2021.x.yupoo.com/categories/5140640 --output /tmp/shoes.xlsx --tags 鞋类,运动鞋,低帮鞋
```

## 4. Export and then fill team content fields
```text
--source-id 225167978 --output /tmp/shoes-with-content.xlsx
```

Say clearly that you also want 商品描述 / 关键信息 / SEO标题 / SEO描述 postfill.

## 5. Crawl a category and export in one request
```text
抓这个分类前 100 条并导出到 /tmp/shoes.xlsx：https://lol2021.x.yupoo.com/categories/5140640
```

This is a chained route:
1. `catalog-ingestion`
2. `shoes-transformer` or `team-content`

So the request should still make clear:
- category URL
- positive limit
- output path
- whether tags or team-content postfill are needed

## Requests that need one short follow-up
- `帮我跑一下这个链接：https://lol2021.x.yupoo.com/albums/225167978?uid=1&isSubCate=false`
- `导出一下这批鞋子`
- `这个类目先看一下再跑`

## Invalid examples
- non-Yupoo URLs for crawl or ingest
- category requests without a positive limit
- export requests without a selector
- export requests without an output path
- requests that omit whether crawl-plus-export should just导出, 还是还要补团队文案
