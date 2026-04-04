Valid request shapes:

```text
--source-id 225167978 --output /tmp/shoes-import.xlsx --tags 鞋类,运动鞋,低帮鞋
```

```text
--source-url https://lol2021.x.yupoo.com/albums/225167978 --output /tmp/shoes-import.xlsx --tags 鞋类,运动鞋,低帮鞋
```

```text
--id 1 --output /tmp/shoes-import.xlsx --template "/Users/bytedance/Desktop/business/commerce-tool/商品导入模板.xlsx" --tags 鞋类,运动鞋,低帮鞋
```

```text
--category-id 5057073 --output /tmp/shoes-import.xlsx --tags 鞋类,运动鞋,低帮鞋
```

```text
--category-url https://lol2021.x.yupoo.com/categories/5057073 --output /tmp/shoes-import.xlsx --tags 鞋类,运动鞋,低帮鞋
```

Invalid request shapes:
- no selector
- no output path
- asking to crawl new items
- asking to transform arbitrary spreadsheet rows that are not in the DB
