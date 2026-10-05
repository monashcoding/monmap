/**
 * The public origin used for canonical URLs, the sitemap, OG image URLs
 * and robots.txt. The Docker build sets NEXT_PUBLIC_SITE_URL (see
 * .github/workflows/deploy.yml); local dev falls back to localhost.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (!explicit) return "http://localhost:3000"
  return explicit.startsWith("http://") || explicit.startsWith("https://")
    ? explicit
    : `https://${explicit}`
}

export const siteUrl = resolveSiteUrl()

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path
  const base = siteUrl.replace(/\/$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return ""
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function truncate(text: string, max = 160): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max - 1)
  const lastSpace = slice.lastIndexOf(" ")
  return `${slice.slice(0, lastSpace > 40 ? lastSpace : slice.length)}…`
}
