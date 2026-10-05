import { renderSitemapIndex } from "@/lib/handbook/sitemap"

// The sitemap index. It lists one sitemap per page type, each under
// the 50,000-URL limit. Rendered per request (the build has no
// database) and cached by the CDN and crawlers for a day.
export const dynamic = "force-dynamic"

export function GET() {
  return new Response(renderSitemapIndex(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
