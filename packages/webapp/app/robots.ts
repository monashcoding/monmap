import type { MetadataRoute } from "next"

import { isPreviewDeployment, siteUrl } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  // Preview deploys (Vercel preview env, branch deployments) should
  // never end up in Google's index — they'd compete with the canonical
  // prod URL and create duplicate-content noise.
  if (isPreviewDeployment) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    }
  }
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
