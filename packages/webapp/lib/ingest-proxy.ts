/*
 * The pure parts of the /ingest proxy (app/ingest/[...path]/route.ts):
 * which PostHog URL a path maps to, and which headers cross in each
 * direction. The privacy guarantee lives here: the shared
 * `.monashcoding.com` session cookie is never forwarded, and PostHog's
 * set-cookie never reaches the browser.
 */

export const API_HOST = "https://us.i.posthog.com"
export const ASSET_HOST = "https://us-assets.i.posthog.com"

/**
 * posthog-js batches and replay chunks stay well under this. Anything
 * bigger gets a 413, so one request cannot fill the heap of the single
 * Node process.
 */
export const MAX_BODY = 1_000_000

// The paths the installed posthog-js calls, by prefix: events, replay,
// feature flags, remote config and its lazy-loaded scripts. `/i/` is
// PostHog's ingestion prefix as a whole, because remote config picks the
// event endpoint under it (today `/i/v0/e/`). Everything else on
// PostHog's hosts (its REST API, for one) gets a 404.
const API_PATHS = [
  "/e/",
  "/i/",
  "/batch/",
  "/capture/",
  "/decide/",
  "/flags/",
  "/s/",
]
const ASSET_PATHS = ["/static/", "/array/"]

const REQUEST_HEADERS = [
  "accept",
  "content-type",
  "content-encoding",
  "user-agent",
  // The client's IP from the reverse proxy, for PostHog's geo-IP.
  "x-forwarded-for",
]

// Content types the proxy serves as they are. Anything else (text/html
// above all) is served as plain text, so it never renders as a page on
// the MonMap origin.
const SAFE_TYPES = [
  "application/json",
  "application/javascript",
  "text/javascript",
  "text/plain",
]

function allowed(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (p) => pathname === p.slice(0, -1) || pathname.startsWith(p)
  )
}

/**
 * The PostHog URL for a request to `/ingest/...`, or null when the
 * path is not one posthog-js uses. The check runs on the resolved URL,
 * so dot segments cannot climb out of an allowed prefix.
 */
export function ingestTarget(pathname: string, search: string): URL | null {
  const path = pathname.replace(/^\/ingest(?=\/|$)/, "")
  const host = allowed(path, ASSET_PATHS) ? ASSET_HOST : API_HOST
  const target = new URL(`${host}${path}${search}`)
  if (target.origin !== host) return null
  const paths = host === ASSET_HOST ? ASSET_PATHS : API_PATHS
  return allowed(target.pathname, paths) ? target : null
}

/** The request headers PostHog gets: a short allowlist, never a cookie. */
export function forwardRequestHeaders(from: Headers): Headers {
  const headers = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = from.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

/**
 * The response headers the browser gets. Node's fetch decompresses the
 * body, so content-encoding and content-length must not be copied.
 */
export function forwardResponseHeaders(from: Headers): Headers {
  const headers = new Headers({ "x-content-type-options": "nosniff" })
  const type = from.get("content-type")
  if (type) {
    const safe = SAFE_TYPES.includes(type.split(";")[0].trim().toLowerCase())
    headers.set("content-type", safe ? type : "text/plain; charset=utf-8")
  }
  const cacheControl = from.get("cache-control")
  if (cacheControl) headers.set("cache-control", cacheControl)
  return headers
}

export class BodyTooLarge extends Error {}

/**
 * Passes the body through and errors with BodyTooLarge once more than
 * `max` bytes have gone by. That also covers chunked uploads, which
 * send no content-length.
 */
export function capBody(max: number): TransformStream<Uint8Array, Uint8Array> {
  let total = 0
  return new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength
      if (total > max) controller.error(new BodyTooLarge())
      else controller.enqueue(chunk)
    },
  })
}
