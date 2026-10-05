/** The sitemaps listed in the /sitemap.xml index, one per page type. */
export const SITEMAP_FILES = ["pages", "courses", "aos", "units"] as const
export type SitemapFile = (typeof SITEMAP_FILES)[number]
