import { splitCodes } from "@/lib/api/query"
import { HANDBOOK_CACHE, json, knownYear, searchParams } from "@/lib/api/server"
import { fetchUnitText } from "@/lib/db/queries"

/** One unit and its equivalents: what one detail panel shows. */
const MAX_TEXT_CODES = 12

/**
 * The synopsis and enrolment rules of the unit a detail panel opens
 * (and its equivalents). Every other payload leaves this prose out.
 *
 * GET /api/units/text?codes=FIT1008,FIT2085&year=2026
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const params = searchParams(req)
  const year = await knownYear(params.get("year"))
  const codes = splitCodes(params.get("codes"), MAX_TEXT_CODES)
  if (!year || codes.length === 0) return json({}, HANDBOOK_CACHE)
  return json(await fetchUnitText(codes, year), HANDBOOK_CACHE)
}
