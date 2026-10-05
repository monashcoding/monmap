import {
  EMPTY_CACHE,
  HANDBOOK_CACHE,
  json,
  knownYear,
  searchParams,
} from "@/lib/api/server"
import { cleanQuery } from "@/lib/db/input"
import { searchUnits } from "@/lib/db/queries"

/**
 * Units whose code or title matches `q`, at most 25.
 *
 * GET /api/units/search?q=algorithms&year=2026
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const params = searchParams(req)
  const year = await knownYear(params.get("year"))
  const q = cleanQuery(params.get("q"))
  if (!year || !q) return json([], EMPTY_CACHE)
  return json(await searchUnits(q, 25, year), HANDBOOK_CACHE)
}
