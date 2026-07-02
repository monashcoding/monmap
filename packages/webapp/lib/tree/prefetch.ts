/**
 * Server-side helper that loads everything <TreeView> needs to render
 * its initial graph. Used by the /tree page for its first paint.
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

export async function prefetchTreeData(
  controls: TreeControlsValue
): Promise<TreeGraphPayload> {
  const empty: TreeGraphPayload = {
    graph: { seeds: [], nodes: [], edges: [] },
    units: {},
    offerings: {},
    requisites: {},
    enrolmentRules: {},
  }
  const graph = await (async () => {
    if (controls.mode === "course") {
      if (!controls.courseCode) return empty.graph
      return expandCourseClosure(
        controls.courseCode,
        controls.aosCode,
        controls.year,
        FIXED_TREE_DEPTH
      )
    }
    if (!controls.unitCode) return empty.graph
    return expandRequisiteGraph(
      [controls.unitCode],
      controls.year,
      controls.direction,
      FIXED_TREE_DEPTH
    )
  })()
  if (graph.nodes.length === 0) return empty
  const { units, offerings, requisites } = await hydratePlannerUnits(
    graph.nodes,
    controls.year
  )
  const enrolment = await fetchEnrolmentRulesForCodes(
    graph.nodes,
    controls.year
  )
  return {
    graph,
    units: Object.fromEntries(units),
    offerings: Object.fromEntries(offerings),
    requisites: Object.fromEntries(requisites),
    enrolmentRules: Object.fromEntries(enrolment),
  }
}
