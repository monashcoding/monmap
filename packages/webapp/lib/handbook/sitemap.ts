/**
 * The XML sitemaps: /sitemap.xml is an index of one sitemap per page
 * type, each under the 50,000-URL limit. The routes in app/sitemaps and
 * app/sitemap.xml fetch the codes and call these. Pure, so it is tested
 * without a database.
 */
import { absoluteUrl } from "../seo.ts"
import { entityHref, type EntityKind } from "./links.ts"

/** The sitemaps listed in the /sitemap.xml index, one per page type. */
export const SITEMAP_FILES = ["pages", "courses", "aos", "units"] as const
export type SitemapFile = (typeof SITEMAP_FILES)[number]

export const SITEMAP_KIND: Record<Exclude<SitemapFile, "pages">, EntityKind> = {
  courses: "course",
  aos: "aos",
  units: "unit",
}

export interface SitemapUrl {
  loc: string
  priority: string
  changefreq: string
  lastmod?: string | null
}

/** The sitemap a request names ("units.xml"), or null. */
export function sitemapFile(file: string): SitemapFile | null {
  const name = file.replace(/\.xml$/, "")
  return (SITEMAP_FILES as readonly string[]).includes(name)
    ? (name as SitemapFile)
    : null
}

/** The hand-written pages. */
export function pageUrls(): SitemapUrl[] {
  return [
    { loc: absoluteUrl("/"), priority: "1.0", changefreq: "weekly" },
    { loc: absoluteUrl("/courses"), priority: "0.9", changefreq: "weekly" },
    { loc: absoluteUrl("/aos"), priority: "0.8", changefreq: "weekly" },
    { loc: absoluteUrl("/search"), priority: "0.8", changefreq: "weekly" },
  ]
}

/**
 * One URL per current code, at its bare URL. `lastmod` is when the
 * code's reviews last changed.
 */
export function entityUrls(
  kind: EntityKind,
  entries: readonly { code: string; lastmod: string | null }[]
): SitemapUrl[] {
  return entries.map((e) => ({
    loc: absoluteUrl(entityHref(kind, e.code)),
    // Reviewed pages first: they carry the most unique content.
    priority: e.lastmod ? "0.8" : kind === "unit" ? "0.6" : "0.7",
    changefreq: e.lastmod ? "weekly" : "monthly",
    lastmod: e.lastmod,
  }))
}

export function renderUrlset(urls: readonly SitemapUrl[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>
`
}

export function renderSitemapIndex(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_FILES.map((f) => `  <sitemap><loc>${escapeXml(absoluteUrl(`/sitemaps/${f}.xml`))}</loc></sitemap>`).join("\n")}
</sitemapindex>
`
}

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      `&${{ "<": "lt", ">": "gt", "&": "amp", "'": "apos", '"': "quot" }[c]};`
  )
}
