/**
 * Server half of the public GET endpoints under app/api. Each one is
 * open to anyone with any query string, so it checks every parameter
 * (lib/db/input.ts, lib/api/query.ts) before it queries. Bad input gets
 * an empty result, not an error, so a stale client still renders.
 *
 * Nothing here reads cookies or the session: every response is the
 * same for every visitor, which is what makes the public cache headers
 * safe. Per-user reads stay in the server actions.
 */
import { RATINGS_MAX_AGE_S } from "@/lib/api/query"
import { cleanYear } from "@/lib/db/input"
import { hydratePlannerUnits, listAvailableYears } from "@/lib/db/queries"
import type { UnitBundle } from "@/lib/planner/unit-cache"

/**
 * Handbook data, which changes only when ingest runs. A shared cache
 * keeps a copy for a day, like the ISR pages, and may serve it stale
 * for one more day while it refetches.
 */
export const HANDBOOK_CACHE =
  "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400"
/**
 * An empty answer to missing or invalid input, such as a year the
 * server does not know yet. It is cached briefly, so it does not
 * outlive the ingest that fills it.
 */
export const EMPTY_CACHE = "public, max-age=60"
/**
 * Ratings and public reviews, which change with every review. No
 * stale-while-revalidate: a review that is deleted or hidden by a
 * moderator must be gone within RATINGS_MAX_AGE_S.
 */
export const RATINGS_CACHE = `public, max-age=${RATINGS_MAX_AGE_S}`

export function json(body: unknown, cacheControl: string): Response {
  return Response.json(body, { headers: { "Cache-Control": cacheControl } })
}

/** The query parameters of `req`. */
export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams
}

/** `year` when it is a handbook year in the database. */
export async function knownYear(year: unknown): Promise<string | null> {
  return cleanYear(year, await listAvailableYears())
}

export const NOTHING_HYDRATED: UnitBundle = {
  units: {},
  offerings: {},
  requisites: {},
}

/** Plain objects, so the maps serialise to JSON. */
export function plain(
  h: Awaited<ReturnType<typeof hydratePlannerUnits>>
): UnitBundle {
  return {
    units: Object.fromEntries(h.units),
    offerings: Object.fromEntries(h.offerings),
    requisites: Object.fromEntries(h.requisites),
  }
}
