import {
  EMPTY_CACHE,
  HANDBOOK_CACHE,
  json,
  searchParams,
} from "@/lib/api/server"
import { cleanTreeControls } from "@/lib/db/input"
import { listAvailableYears } from "@/lib/db/queries"
import { EMPTY_TREE_PAYLOAD, prefetchTreeData } from "@/lib/tree/prefetch"

/**
 * The requisite graph for the current controls, with every unit's
 * data, offerings, structured rules and enrolment gates. The handbook
 * pages render the first paint with the same function.
 *
 * GET /api/tree?course=C2001&direction=upstream&mode=course&year=2026
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const params = searchParams(req)
  const controls = cleanTreeControls(
    {
      year: params.get("year"),
      mode: params.get("mode"),
      direction: params.get("direction"),
      courseCode: params.get("course"),
      unitCode: params.get("unit"),
      aosCode: params.get("aos"),
    },
    await listAvailableYears()
  )
  if (!controls) return json(EMPTY_TREE_PAYLOAD, EMPTY_CACHE)
  return json(await prefetchTreeData(controls), HANDBOOK_CACHE)
}
