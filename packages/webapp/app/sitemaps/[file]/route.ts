import { listSitemapCodes } from "@/lib/db/handbook"
import { entityHref, type EntityKind } from "@/lib/handbook/links"
import { SITEMAP_FILES, type SitemapFile } from "@/lib/handbook/sitemap"
import { absoluteUrl } from "@/lib/seo"

const KIND: Record<Exclude<SitemapFile, "pages">, EntityKind> = {
  courses: "course",
  aos: "aos",
  units: "unit",
}

// Rendered per request: the build has no database. The code lists are
// memoised in process, so a crawler re-fetching costs one query a day.
export const dynamic = "force-dynamic"

/**
 * /sitemaps/pages.xml, /sitemaps/courses.xml, /sitemaps/aos.xml and
 * /sitemaps/units.xml. Each code is listed once, at its bare URL,
 * which shows its latest handbook year; earlier years link from there.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params
  const name = file.replace(/\.xml$/, "") as SitemapFile
  if (!SITEMAP_FILES.includes(name))
    return new Response("Not found", { status: 404 })

  const urls: Array<{ loc: string; priority: string; changefreq: string }> =
    name === "pages"
      ? [
          { loc: absoluteUrl("/"), priority: "1.0", changefreq: "weekly" },
          {
            loc: absoluteUrl("/search"),
            priority: "0.9",
            changefreq: "weekly",
          },
        ]
      : (await listSitemapCodes(KIND[name])).map((code) => ({
          loc: absoluteUrl(entityHref(KIND[name], code)),
          priority: name === "units" ? "0.6" : "0.7",
          changefreq: "monthly",
        }))

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${escapeXml(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>
`
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      `&${{ "<": "lt", ">": "gt", "&": "amp", "'": "apos", '"': "quot" }[c]};`
  )
}
