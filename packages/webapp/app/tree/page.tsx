import { getCurrentUser } from "@/lib/auth-server"
import { HANDBOOK_YEAR } from "@/lib/db/client"
import {
  expandCourseClosure,
  expandRequisiteGraph,
  fetchCourseWithAoS,
  fetchEnrolmentRulesForCodes,
  hydratePlannerUnits,
  listAvailableYears,
  listCoursesForPicker,
  listUserPlans,
  getUserPlanById,
} from "@/lib/db/queries"
import type { PlannerCourseWithAoS, PlannerState } from "@/lib/planner/types"
import type { TreeControlsValue, TreeGraphPayload } from "@/lib/tree/payload"
import type { TreeDirection, TreeMode } from "@/lib/tree/types"

import { TreeView } from "@/components/tree/tree-view"

/**
 * Server shell for `/tree`. Resolves an initial controls value from
 * the URL (?course=, ?aos=, ?unit=, ?direction=, ?year=) and pre-runs
 * the first graph fetch so the page is rendered with content on first
 * paint. The client orchestrator (TreeView) takes over from there.
 *
 * Default landing: course = C2000 (BIT), no AoS, depth 4. Empty if
 * the URL specifies `?unit=`.
 */
export default async function TreePage({
  searchParams,
}: {
  searchParams: Promise<{
    course?: string
    aos?: string
    unit?: string
    direction?: string
    year?: string
    depth?: string
    plan?: string
  }>
}) {
  const DEFAULT_COURSE = "C2000"
  const params = await searchParams
  const [availableYears, currentUser] = await Promise.all([
    listAvailableYears(),
    getCurrentUser(),
  ])
  const fallbackYear = availableYears.at(-1) ?? HANDBOOK_YEAR
  const year =
    params.year && availableYears.includes(params.year)
      ? params.year
      : fallbackYear

  const userPlans = currentUser ? await listUserPlans(currentUser.id) : []
  const requestedPlanId = params.plan ?? null
  const activePlanId =
    requestedPlanId && userPlans.some((p) => p.id === requestedPlanId)
      ? requestedPlanId
      : (userPlans[0]?.id ?? null)
  const activePlan: PlannerState | null =
    currentUser && activePlanId
      ? ((await getUserPlanById(activePlanId, currentUser.id))?.state ?? null)
      : null

  // Initial controls — URL overrides win, else default to BIT (C2000).
  const initialMode: TreeMode = params.unit ? "unit" : "course"
  const initialDirection: TreeDirection =
    params.direction === "downstream" || params.direction === "both"
      ? params.direction
      : "upstream"
  const initialDepth = clamp(parseInt(params.depth ?? "", 10) || 4, 1, 5)
  const initialControls: TreeControlsValue = {
    mode: initialMode,
    courseCode:
      initialMode === "course" ? (params.course ?? DEFAULT_COURSE) : null,
    aosCode: initialMode === "course" ? (params.aos ?? null) : null,
    unitCode: initialMode === "unit" ? (params.unit ?? null) : null,
    direction: initialDirection,
    depth: initialDepth,
    year,
    useMyPlan: activePlan != null,
  }

  // Pre-fetch the initial graph + hydrate so the page paints with content.
  const initial = await prefetchTreeData(initialControls)

  // Course meta for the AoS picker. Only relevant in course mode.
  let initialCourse: PlannerCourseWithAoS | null = null
  if (initialControls.mode === "course" && initialControls.courseCode) {
    initialCourse = await fetchCourseWithAoS(
      initialControls.courseCode,
      initialControls.year
    )
  }

  const courses = await listCoursesForPicker(null, 300, year)

  return (
    <TreeView
      availableYears={availableYears.length > 0 ? availableYears : [year]}
      courses={courses}
      initialCourse={initialCourse}
      initial={{
        controls: initialControls,
        graph: initial.graph,
        units: initial.units,
        offerings: initial.offerings,
        requisites: initial.requisites,
        enrolmentRules: initial.enrolmentRules,
      }}
      signedIn={currentUser != null}
      activePlan={activePlan}
    />
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

async function prefetchTreeData(
  controls: TreeControlsValue
): Promise<TreeGraphPayload> {
  const empty: TreeGraphPayload = {
    graph: { seeds: [], nodes: [], edges: [] },
    units: {},
    offerings: {},
    requisites: {},
    enrolmentRules: {},
  }
  const depth = clamp(controls.depth, 1, 5)
  const graph = await (async () => {
    if (controls.mode === "course") {
      if (!controls.courseCode) return empty.graph
      return expandCourseClosure(
        controls.courseCode,
        controls.aosCode,
        controls.year,
        depth
      )
    }
    if (!controls.unitCode) return empty.graph
    return expandRequisiteGraph(
      [controls.unitCode],
      controls.year,
      controls.direction,
      depth
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
