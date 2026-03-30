# catalog-ingestion request template

Use one of these exact request shapes.

## Album
```text
<yupoo-album-url>
```

Example:
```text
https://lol2021.x.yupoo.com/albums/225167978?uid=1&isSubCate=false
```

## Category
```text
<yupoo-category-url> <positive-limit>
```

Example:
```text
https://lol2021.x.yupoo.com/categories/4372478 50
```

## Invalid examples
- non-Yupoo URLs
- category URLs without a positive limit
- arbitrary crawl instructions without a concrete supported URL
