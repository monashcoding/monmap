import type { MetadataRoute } from "next"

import { absoluteUrl } from "@/lib/seo"

/**
 * The per-entity pages (/units/[code], /courses/[code]) were retired
 * when the site went back to being a SPA — enumerating ~40k entity
 * URLs here kept Googlebot hammering lazy-ISR pages and blew the
 * Vercel free tier. Only the real pages are listed now; old entity
 * URLs 308-redirect to /tree (see next.config.mjs) so crawlers drop
 * them from the index on their own.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: absoluteUrl("/tree"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ]
}
