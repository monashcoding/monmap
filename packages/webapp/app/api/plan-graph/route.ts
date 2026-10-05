import type { PlanGraphData } from "@/lib/api/client"
import { MAX_GRAPH_CODES, splitCodes } from "@/lib/api/query"
import {
  EMPTY_CACHE,
  HANDBOOK_CACHE,
  json,
  knownYear,
  searchParams,
} from "@/lib/api/server"
import { expandRequisiteGraph, hydratePlannerUnits } from "@/lib/db/queries"

/**
 * The prerequisite links between a fixed set of units, for the
 * planner's read-only map of a plan: no closure walk (depth 0), so
 * only the plan's own units (and any requirement units the caller
 * adds) come back, with their titles.
 *
 * GET /api/plan-graph?codes=FIT1008,FIT1045&year=2026
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const params = searchParams(req)
  const year = await knownYear(params.get("year"))
  const codes = splitCodes(params.get("codes"), MAX_GRAPH_CODES)
  if (!year || codes.length === 0) {
    const empty: PlanGraphData = { edges: [], units: {} }
    return json(empty, EMPTY_CACHE)
  }
  const [graph, hydrated] = await Promise.all([
    expandRequisiteGraph(codes, year, "both", 0),
    hydratePlannerUnits(codes, year),
  ])
  const body: PlanGraphData = {
    edges: graph.edges,
    units: Object.fromEntries(hydrated.units),
  }
  return json(body, HANDBOOK_CACHE)
}
