// Warm the on-demand ISR cache for every URL in the sitemap.
//
// Why this exists: /units/[code] and /courses/[code] are lazy-ISR
// (empty generateStaticParams, dynamicParams=true) — the FIRST request
// per code renders live (~5 DB queries) and caches for 7 days. When
// Googlebot crawls the sitemap it hits thousands of never-rendered URLs
// in an uncontrolled burst; the concurrent cold renders exhaust the
// Postgres pooler's connections and some renders time out → Googlebot
// records a 5xx (which is what shows up weeks later in Search Console,
// even though the now-cached page serves a clean 200 when you click it).
//
// This script walks the exact same URLs a few at a time, so it primes
// the cache WITHOUT the stampede: at most CONCURRENCY renders run at
// once → at most CONCURRENCY DB connections. Run it after each deploy /
// after busting the handbook cache tag, so bots only ever hit warm 200s.
//
// Usage:
//   node scripts/warm-cache.mjs [baseUrl] [--concurrency N]
//   BASE_URL=https://monmap.monashcoding.com node scripts/warm-cache.mjs
//
// Defaults to https://monmap.monashcoding.com. No dependencies — plain
// Node fetch, so it needs no build step or workspace access.

const args = process.argv.slice(2)
const flagIdx = args.indexOf("--concurrency")
const concurrency =
  flagIdx !== -1 ? Number(args[flagIdx + 1]) : Number(process.env.WARM_CONCURRENCY ?? 6)
const positional = args.filter((a, i) => !a.startsWith("--") && i !== flagIdx + 1)
const base = (positional[0] ?? process.env.BASE_URL ?? "https://monmap.monashcoding.com").replace(
  /\/$/,
  "",
)

if (!Number.isFinite(concurrency) || concurrency < 1) {
  console.error(`Invalid concurrency: ${concurrency}`)
  process.exit(1)
}

/** Pull every <loc>…</loc> out of the sitemap XML. */
async function loadUrls() {
  const res = await fetch(`${base}/sitemap.xml`, { headers: { "user-agent": "monmap-warm" } })
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status} ${res.statusText}`)
  const xml = await res.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

/** GET one URL (a full ISR render on a cache miss); return its status. */
async function warm(url) {
  try {
    const res = await fetch(url, {
      // A crawler-ish UA so this looks like the traffic we're priming for.
      headers: { "user-agent": "monmap-warm" },
      redirect: "manual",
    })
    return res.status
  } catch (err) {
    return `ERR ${err instanceof Error ? err.message : String(err)}`
  }
}

async function main() {
  console.log(`Warming ${base} (concurrency ${concurrency})…`)
  const urls = await loadUrls()
  console.log(`Sitemap has ${urls.length} URLs.`)

  let done = 0
  const failures = []
  let cursor = 0

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      const status = await warm(url)
      done++
      if (status !== 200) failures.push({ url, status })
      if (done % 200 === 0 || done === urls.length) {
        console.log(`  ${done}/${urls.length} (${failures.length} non-200)`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker))

  if (failures.length > 0) {
    console.log(`\n${failures.length} non-200 responses:`)
    for (const f of failures.slice(0, 50)) console.log(`  ${f.status}  ${f.url}`)
    if (failures.length > 50) console.log(`  …and ${failures.length - 50} more`)
    process.exitCode = 1
  } else {
    console.log(`\nAll ${urls.length} URLs returned 200.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
