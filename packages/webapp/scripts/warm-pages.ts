/**
 * Fill the ISR cache for the handbook pages after a deploy, slowly.
 *
 * The build renders no handbook pages (it has no database, and about
 * 10,000 pages would make every build slow). Each page renders on its
 * first visit instead, which costs that first visitor ~1 s. This script
 * makes those first visits itself, a few at a time, so real visitors
 * and crawlers get cached HTML.
 *
 *   node scripts/warm-pages.ts --base https://monmap.monashcoding.com
 *
 * Options:
 *   --base URL        the site to warm (required)
 *   --only KIND       units, courses or aos (default: all three)
 *   --concurrency N   requests in flight at once (default 2)
 *   --delay MS        pause after each request, per worker (default 200)
 *   --limit N         stop after N pages
 */

export {}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const base = arg("base")?.replace(/\/$/, "")
if (!base) {
  console.error("Usage: node scripts/warm-pages.ts --base https://example.com")
  process.exit(1)
}
const only = arg("only")
const concurrency = Math.max(1, Number(arg("concurrency") ?? 2))
const delay = Math.max(0, Number(arg("delay") ?? 200))
const limit = Number(arg("limit") ?? Infinity)

const locs = (xml: string) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  )
// Sitemaps carry the public origin; request the same paths on --base.
const onBase = (url: string) => base + new URL(url).pathname

async function text(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  return res.text()
}

const files = locs(await text(`${base}/sitemap.xml`))
  .map(onBase)
  .filter((f) => !f.endsWith("/pages.xml"))
  .filter((f) => !only || f.endsWith(`/${only}.xml`))
const urls: string[] = []
for (const f of files) urls.push(...locs(await text(f)).map(onBase))
const queue = urls.slice(0, limit)
console.log(`Warming ${queue.length} pages, ${concurrency} at a time`)

let done = 0
let failed = 0
const started = Date.now()
async function worker() {
  for (;;) {
    const url = queue.shift()
    if (!url) return
    try {
      const res = await fetch(url, { redirect: "manual" })
      await res.arrayBuffer()
      if (res.status >= 500) {
        failed++
        console.warn(`${res.status} ${url}`)
      }
    } catch (e) {
      failed++
      console.warn(`error ${url}: ${(e as Error).message}`)
    }
    done++
    if (done % 100 === 0) {
      const rate = done / ((Date.now() - started) / 1000)
      console.log(`${done} done, ${failed} failed, ${rate.toFixed(1)} pages/s`)
    }
    if (delay) await new Promise((r) => setTimeout(r, delay))
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
console.log(`Finished: ${done} pages, ${failed} failed`)
