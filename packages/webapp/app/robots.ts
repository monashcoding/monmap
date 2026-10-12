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
        // "/?course=" is "Plan this course" (planCourseHref): the
        // planner home page, whose canonical is "/".
        disallow: [
          "/api/",
          "/sign-in",
          "/plans",
          "/admin",
          "/my-reviews",
          "/?course=",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
