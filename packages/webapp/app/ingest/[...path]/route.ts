/**
 * Same-origin proxy for PostHog (`api_host: "/ingest"` in
 * components/posthog-identify.tsx), so ad blockers that block PostHog's
 * hosts don't drop analytics.
 *
 * This is a route handler, not a next.config rewrite, because a rewrite
 * forwards every request header. That includes the shared
 * `.monashcoding.com` session cookie, which signs its holder in to every
 * MAC app. This handler forwards a short allowlist of headers, never a
 * cookie, and drops PostHog's set-cookie.
 */

const API_HOST = "https://us.i.posthog.com"
const ASSET_HOST = "https://us-assets.i.posthog.com"

const REQUEST_HEADERS = [
  "accept",
  "content-type",
  "content-encoding",
  "user-agent",
  // The client's IP from the reverse proxy, for PostHog's geo-IP.
  "x-forwarded-for",
]

// Node's fetch decompresses the body, so content-encoding and
// content-length must not be copied.
const RESPONSE_HEADERS = ["content-type", "cache-control"]

export const dynamic = "force-dynamic"

async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/ingest/, "")
  const host = /^\/(static|array)\//.test(path) ? ASSET_HOST : API_HOST

  const headers = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD"

  let upstream: Response
  try {
    upstream = await fetch(`${host}${path}${url.search}`, {
      method: req.method,
      headers,
      // posthog-js sends gzip or base64 bodies; pass the bytes through.
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return new Response(null, { status: 502 })
  }

  const out = new Headers()
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) out.set(name, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers: out })
}

export const GET = proxy
export const POST = proxy
export const OPTIONS = proxy
