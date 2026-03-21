import { runAlbumIngestion } from "../skills/catalogIngestion/runAlbumIngestion.ts"

const url = process.argv[2]

if (!url) {
  console.error("Usage: bun run ingest:album <album-url>")
  process.exit(1)
}

const result = await runAlbumIngestion({
  mode: "album",
  url,
})

console.log(JSON.stringify(result, null, 2))

if (result.status === "error") {
  process.exit(1)
}
