import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  // Crawling is allowed by default; this lists only what to block.
  // The handbook pages (/units, /courses, /aos) are listed in the
  // sitemap index at /sitemap.xml.
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/api/", "/sign-in", "/plans", "/admin", "/my-reviews"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
