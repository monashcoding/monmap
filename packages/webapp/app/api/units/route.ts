import { splitCodes } from "@/lib/api/query"
import {
  HANDBOOK_CACHE,
  json,
  knownYear,
  NOTHING_HYDRATED,
  plain,
  searchParams,
} from "@/lib/api/server"
import { hydratePlannerUnits } from "@/lib/db/queries"

/**
 * Unit data, offerings and requisites for up to MAX_URL_CODES units of
 * one handbook year.
 *
 * GET /api/units?codes=FIT1008,FIT1045&year=2026
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const params = searchParams(req)
  const year = await knownYear(params.get("year"))
  const codes = splitCodes(params.get("codes"))
  if (!year || codes.length === 0) return json(NOTHING_HYDRATED, HANDBOOK_CACHE)
  return json(plain(await hydratePlannerUnits(codes, year)), HANDBOOK_CACHE)
}
