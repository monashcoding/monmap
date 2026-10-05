import { test } from "node:test"
import assert from "node:assert/strict"

import {
  entityUrls,
  escapeXml,
  pageUrls,
  renderSitemapIndex,
  renderUrlset,
  sitemapFile,
} from "./sitemap.ts"

test("escapeXml turns & < > ' \" into entities", () => {
  assert.equal(escapeXml(`a&b<c>d'e"f`), "a&amp;b&lt;c&gt;d&apos;e&quot;f")
  assert.equal(escapeXml("FIT1045"), "FIT1045")
})

test("file names map to sitemaps; anything else is rejected", () => {
  assert.equal(sitemapFile("units.xml"), "units")
  assert.equal(sitemapFile("pages.xml"), "pages")
  assert.equal(sitemapFile("aos"), "aos")
  assert.equal(sitemapFile("foo.xml"), null)
  assert.equal(sitemapFile("units.xml.xml"), null)
  assert.equal(sitemapFile("constructor"), null)
})

test("a reviewed entry gets priority 0.8 and weekly", () => {
  const [u] = entityUrls("unit", [
    { code: "FIT1045", lastmod: "2026-09-01T00:00:00.000Z" },
  ])
  assert.equal(u.priority, "0.8")
  assert.equal(u.changefreq, "weekly")
  assert.match(u.loc, /\/units\/FIT1045$/)
})

test("an unreviewed unit gets 0.6 and monthly, a course or AoS 0.7", () => {
  const [unit] = entityUrls("unit", [{ code: "FIT1045", lastmod: null }])
  const [course] = entityUrls("course", [{ code: "C2001", lastmod: null }])
  const [aos] = entityUrls("aos", [{ code: "SFTWRDEV08", lastmod: null }])
  assert.deepEqual(
    [unit.priority, course.priority, aos.priority],
    ["0.6", "0.7", "0.7"]
  )
  assert.equal(unit.changefreq, "monthly")
  assert.match(course.loc, /\/courses\/C2001$/)
  assert.match(aos.loc, /\/aos\/SFTWRDEV08$/)
})

test("renderUrlset escapes locations and omits a null lastmod", () => {
  const xml = renderUrlset([
    {
      loc: "https://x.test/a?b=1&c=2",
      priority: "0.5",
      changefreq: "monthly",
      lastmod: null,
    },
    {
      loc: "https://x.test/b",
      priority: "0.8",
      changefreq: "weekly",
      lastmod: "2026-09-01T00:00:00.000Z",
    },
  ])
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset /)
  assert.ok(xml.includes("<loc>https://x.test/a?b=1&amp;c=2</loc><changefreq>"))
  assert.ok(xml.includes("<lastmod>2026-09-01T00:00:00.000Z</lastmod>"))
  assert.equal(xml.match(/<url>/g)?.length, 2)
  assert.equal(xml.match(/<lastmod>/g)?.length, 1)
})

test("the index lists one sitemap per page type", () => {
  const xml = renderSitemapIndex()
  for (const f of ["pages", "courses", "aos", "units"]) {
    assert.ok(xml.includes(`/sitemaps/${f}.xml</loc>`), f)
  }
  assert.equal(pageUrls().length, 4)
})
