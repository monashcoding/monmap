/**
 * Resolve the public origin used for canonical URLs, the sitemap,
 * OG image URLs, robots.txt, etc.
 *
 * Priority (highest wins):
 *   1. NEXT_PUBLIC_SITE_URL — explicit override (e.g. a custom domain
 *      that doesn't match what Vercel knows about).
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production host
 *      for this project. Set automatically on every Vercel deployment.
 *      Same value on preview and production builds, which is exactly
 *      what we want: canonical/sitemap URLs always point at prod, so
 *      preview deploys don't pollute Google's index.
 *   3. VERCEL_URL — the per-deployment hostname. Used only as a last
 *      resort (e.g. previews where canonicals don't matter).
 *   4. localhost.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return withProtocol(explicit)

  const prod =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  if (prod) return withProtocol(prod)

  const vercel = process.env.VERCEL_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL
  if (vercel) return withProtocol(vercel)

  return "http://localhost:3000"
}

function withProtocol(host: string): string {
  if (host.startsWith("http://") || host.startsWith("https://")) return host
  return `https://${host}`
}

export const siteUrl = resolveSiteUrl()

/**
 * True on Vercel preview deployments. Used by robots.ts to disallow
 * crawling so preview hostnames never end up in Google's index.
 */
export const isPreviewDeployment = process.env.VERCEL_ENV === "preview"

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
