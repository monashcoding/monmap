/**
 * Same-origin proxy for PostHog (`api_host: "/ingest"` in
 * lib/analytics.ts), so ad blockers that block PostHog's
 * hosts don't drop analytics.
 *
 * This is a route handler, not a next.config rewrite, because a rewrite
 * forwards every request header. That includes the shared
 * `.monashcoding.com` session cookie, which signs its holder in to every
 * MAC app. This handler forwards a short allowlist of headers, never a
 * cookie, and drops PostHog's set-cookie. The path and header rules
 * live in lib/ingest-proxy.ts.
 */

import {
  BodyTooLarge,
  capBody,
  forwardRequestHeaders,
  forwardResponseHeaders,
  ingestTarget,
  MAX_BODY,
} from "@/lib/ingest-proxy"

export const dynamic = "force-dynamic"

async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const target = ingestTarget(url.pathname, url.search)
  if (!target) return new Response(null, { status: 404 })
  if (Number(req.headers.get("content-length")) > MAX_BODY) {
    return new Response(null, { status: 413 })
  }
  const body = req.method === "GET" || req.method === "HEAD" ? null : req.body

  // Node's fetch needs `duplex` to stream a request body; the DOM
  // RequestInit type does not list it yet.
  const init: RequestInit & { duplex: "half" } = {
    method: req.method,
    headers: forwardRequestHeaders(req.headers),
    // posthog-js sends gzip or base64 bodies; stream the bytes through
    // with a cap instead of buffering them.
    body: body?.pipeThrough(capBody(MAX_BODY)),
    duplex: "half",
    cache: "no-store",
    // Set before the body is read, so it bounds the upload too.
    signal: AbortSignal.timeout(10_000),
    // A redirect to another host must not be fetched from the server.
    redirect: "manual",
  }

  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch (e) {
    const tooLarge = e instanceof Error && e.cause instanceof BodyTooLarge
    return new Response(null, { status: tooLarge ? 413 : 502 })
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response(null, { status: 502 })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: forwardResponseHeaders(upstream.headers),
  })
}

export const GET = proxy
export const POST = proxy
export const OPTIONS = proxy
