/**
 * Same-origin proxy for PostHog (`api_host: "/ingest"`, the default in
 * `@monashcoding/analytics`), so ad blockers that block PostHog's
 * hosts don't drop analytics.
 *
 * This is a route handler, not a next.config rewrite, because a rewrite
 * forwards every request header. That includes the shared
 * `.monashcoding.com` session cookie, which signs its holder in to every
 * MAC app. The package's handler forwards a short allowlist of headers,
 * never a cookie, drops PostHog's set-cookie, and only reaches the
 * paths posthog-js calls.
 */
import { createIngestHandler } from "@monashcoding/analytics/ingest"

const handler = createIngestHandler()

export const dynamic = "force-dynamic"

export const GET = handler
export const POST = handler
export const OPTIONS = handler
