import { listSitemapCodes } from "@/lib/db/handbook"
import {
  entityUrls,
  pageUrls,
  renderUrlset,
  SITEMAP_KIND,
  sitemapFile,
} from "@/lib/handbook/sitemap"

// Rendered per request: the build has no database. The code lists are
// memoised in process, so a crawler re-fetching costs one query an hour.
export const dynamic = "force-dynamic"

/**
 * /sitemaps/pages.xml, /sitemaps/courses.xml, /sitemaps/aos.xml and
 * /sitemaps/units.xml. Each current code is listed once, at its bare
 * URL, which shows its latest handbook year. Year pages and retired
 * codes are noindex, so they are left out.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const name = sitemapFile((await params).file)
  if (!name) return new Response("Not found", { status: 404 })

  const urls =
    name === "pages"
      ? pageUrls()
      : entityUrls(
          SITEMAP_KIND[name],
          await listSitemapCodes(SITEMAP_KIND[name])
        )
  return new Response(renderUrlset(urls), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
