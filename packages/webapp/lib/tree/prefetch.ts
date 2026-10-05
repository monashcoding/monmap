/**
 * Server-side helpers that load everything a requisite graph needs for
 * its first paint: the closure, unit data, offerings, requisites and
 * enrolment rules.
 */
import {
  expandCourseClosure,
  expandRequisiteGraph,
  fetchEnrolmentRulesForCodes,
  hydratePlannerUnits,
} from "../db/queries.ts"

import {
  FIXED_TREE_DEPTH,
  type TreeControlsValue,
  type TreeGraphPayload,
} from "./payload.ts"
import type { TreeDirection, TreeGraphRaw } from "./types.ts"

const EMPTY: TreeGraphPayload = {
  graph: { seeds: [], nodes: [], edges: [] },
  units: {},
  offerings: {},
  requisites: {},
  enrolmentRules: {},
}

async function hydrateGraph(
  graph: TreeGraphRaw,
  year: string
): Promise<TreeGraphPayload> {
  if (graph.nodes.length === 0) return EMPTY
  const [{ units, offerings, requisites }, enrolment] = await Promise.all([
    hydratePlannerUnits(graph.nodes, year),
    fetchEnrolmentRulesForCodes(graph.nodes, year),
  ])
  return {
    graph,
    units: Object.fromEntries(units),
    offerings: Object.fromEntries(offerings),
    requisites: Object.fromEntries(requisites),
    enrolmentRules: Object.fromEntries(enrolment),
  }
}

/** The graph around a set of units, such as an area of study's. */
export async function prefetchGraphForSeeds(
  seeds: readonly string[],
  year: string,
  direction: TreeDirection
): Promise<TreeGraphPayload> {
  if (seeds.length === 0) return EMPTY
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
      if (!controls.courseCode) return EMPTY.graph
      return expandCourseClosure(
        controls.courseCode,
        controls.aosCode,
        controls.year,
        FIXED_TREE_DEPTH
      )
    }
    if (!controls.unitCode) return EMPTY.graph
    return expandRequisiteGraph(
      [controls.unitCode],
      controls.year,
      controls.direction,
      FIXED_TREE_DEPTH
    )
  })()
  return hydrateGraph(graph, controls.year)
}
