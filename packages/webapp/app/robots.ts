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
  // /units/[code] and /courses/[code] used to be per-entity SEO pages
  // but were retired with the move back to a SPA — they now redirect
  // into the /tree workbench (see next.config.mjs). Crawling is
  // allowed by default; we only mention what to block.
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/api/", "/sign-in", "/plans"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
