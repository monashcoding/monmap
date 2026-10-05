import { SITEMAP_FILES } from "@/lib/handbook/sitemap"
import { absoluteUrl } from "@/lib/seo"

// The sitemap index. It lists one sitemap per page type, each under
// the 50,000-URL limit. Rendered per request (the build has no
// database) and cached by the CDN and crawlers for a day.
export const dynamic = "force-dynamic"

export function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_FILES.map((f) => `  <sitemap><loc>${absoluteUrl(`/sitemaps/${f}.xml`)}</loc></sitemap>`).join("\n")}
</sitemapindex>
`
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
