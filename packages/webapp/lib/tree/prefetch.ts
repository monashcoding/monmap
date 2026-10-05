/**
 * Server-side helpers that load everything a requisite graph needs for
 * its first paint: the closure, unit data, offerings, requisites and
 * which units have enrolment rules.
 */
import {
  expandCourseClosure,
  expandRequisiteGraph,
  fetchEnrolmentRulesForCodes,
  hydratePlannerUnits,
} from "../db/queries.ts"

import {
  FIXED_TREE_DEPTH,
  gatedCodes,
  type TreeControlsValue,
  type TreeGraphPayload,
} from "./payload.ts"
import type { TreeDirection, TreeGraphRaw } from "./types.ts"

/** The payload for a graph with no nodes. */
export const EMPTY_TREE_PAYLOAD: TreeGraphPayload = {
  graph: { seeds: [], nodes: [], edges: [] },
  units: {},
  offerings: {},
  requisites: {},
  gated: [],
}

async function hydrateGraph(
  graph: TreeGraphRaw,
  year: string
): Promise<TreeGraphPayload> {
  if (graph.nodes.length === 0) return EMPTY_TREE_PAYLOAD
  const [{ units, offerings, requisites }, enrolment] = await Promise.all([
    hydratePlannerUnits(graph.nodes, year),
    fetchEnrolmentRulesForCodes(graph.nodes, year),
  ])
  return {
    graph,
    units: Object.fromEntries(units),
    offerings: Object.fromEntries(offerings),
    requisites: Object.fromEntries(requisites),
    gated: gatedCodes(enrolment),
  }
}

/** The graph around a set of units, such as an area of study's. */
export async function prefetchGraphForSeeds(
  seeds: readonly string[],
  year: string,
  direction: TreeDirection
): Promise<TreeGraphPayload> {
  if (seeds.length === 0) return EMPTY_TREE_PAYLOAD
  const graph = await expandRequisiteGraph(
    [...seeds].sort(),
    year,
    direction,
    FIXED_TREE_DEPTH
  )
  return hydrateGraph(graph, year)
}

export async function prefetchTreeData(
  controls: TreeControlsValue
): Promise<TreeGraphPayload> {
  const graph = await (async () => {
    if (controls.mode === "course") {
      if (!controls.courseCode) return EMPTY_TREE_PAYLOAD.graph
      return expandCourseClosure(
        controls.courseCode,
        controls.aosCode,
        controls.year,
        FIXED_TREE_DEPTH
      )
    }
    if (!controls.unitCode) return EMPTY_TREE_PAYLOAD.graph
    return expandRequisiteGraph(
      [controls.unitCode],
      controls.year,
      controls.direction,
      FIXED_TREE_DEPTH
    )
  })()
  return hydrateGraph(graph, controls.year)
}
