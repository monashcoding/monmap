import type { RichSearchResult } from "@/lib/api/client"
import {
  HANDBOOK_CACHE,
  json,
  knownYear,
  NOTHING_HYDRATED,
  plain,
  searchParams,
} from "@/lib/api/server"
import { cleanQuery } from "@/lib/db/input"
import { searchUnitsRich } from "@/lib/db/queries"

/**
 * Smart search: text-match a wider candidate pool and bundle every
 * candidate's offerings + requisites so the client can rerank with
 * personalization signals (slot fit, prereq readiness, AoS membership)
 * without a second roundtrip. `rank` preserves the server-side
 * text-match order keyed by code so the client can use it as a
 * tiebreaker.
 *
 * GET /api/units/search-rich?q=algorithms&year=2026
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const params = searchParams(req)
  const year = await knownYear(params.get("year"))
  const q = cleanQuery(params.get("q"))
  if (!year || !q) {
    const empty: RichSearchResult = { ...NOTHING_HYDRATED, rank: {} }
    return json(empty, HANDBOOK_CACHE)
  }
  const { rank, ...hydrated } = await searchUnitsRich(q, year)
  const body: RichSearchResult = {
    ...plain(hydrated),
    rank: Object.fromEntries(rank),
  }
  return json(body, HANDBOOK_CACHE)
}
