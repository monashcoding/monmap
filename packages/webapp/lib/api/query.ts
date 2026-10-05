/**
 * Query strings and limits of the public GET endpoints under app/api.
 * The browser builds each URL with these functions and the route reads
 * it back with them, so the same request always has the same URL and
 * HTTP caches hit. The browser splits its requests by the same limits
 * the routes enforce, so a route never cuts a list short. Pure, so it
 * is tested without a server.
 */
import { isCode } from "../db/input.ts"

/**
 * The most codes one GET request carries. 500 codes keep a URL near
 * 5 KB, well under the 16 KB request head that Node and most proxies
 * accept. The client splits longer lists (chunkCodes).
 */
export const MAX_URL_CODES = 500
/** The most codes one /api/ratings request answers. */
export const MAX_RATING_CODES = 300
/**
 * The most codes one /api/units/text request answers: one unit and its
 * equivalents.
 */
export const MAX_TEXT_CODES = 12
/** The most units /api/plan-graph maps; a real plan has far fewer. */
export const MAX_GRAPH_CODES = 400

/**
 * Seconds a ratings or reviews answer is kept, both by the browser's
 * HTTP cache (RATINGS_CACHE) and by use-ratings. A review that is
 * deleted or hidden by a moderator is gone from an open tab within
 * about this long.
 */
export const RATINGS_MAX_AGE_S = 60

/**
 * `path` with `params` as a query string in key order. Null and empty
 * values are left out.
 */
export function apiUrl(
  path: string,
  params: Record<string, string | null | undefined>
): string {
  const qs = new URLSearchParams()
  for (const k of Object.keys(params).sort()) {
    const v = params[k]
    if (v) qs.set(k, v)
  }
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

/** `codes` deduplicated and sorted, as one comma-separated value. */
export function joinCodes(codes: Iterable<string>): string {
  return [...new Set(codes)].sort().join(",")
}

/** `codes` deduplicated and sorted, in lists of at most `size`. */
export function chunkCodes(
  codes: Iterable<string>,
  size = MAX_URL_CODES
): string[][] {
  const sorted = [...new Set(codes)].sort()
  const out: string[][] = []
  for (let i = 0; i < sorted.length; i += size)
    out.push(sorted.slice(i, i + size))
  return out
}

const keepCode = (c: string) => (isCode(c) ? c : null)

/**
 * The codes in a comma-separated query value: each one passed through
 * `clean`, then deduplicated, sorted (a stable memo key) and cut to
 * `max`. By default an invalid code is dropped, not rewritten, because
 * the planner matches results back to the codes it sent.
 */
export function splitCodes(
  value: string | null,
  max = MAX_URL_CODES,
  clean: (code: string) => string | null = keepCode
): string[] {
  if (!value) return []
  const out = new Set<string>()
  for (const raw of value.split(",")) {
    const code = clean(raw)
    if (code) out.add(code)
  }
  return [...out].sort().slice(0, max)
}
