import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth-server"
import { HANDBOOK_YEAR } from "@/lib/db/client"
import { listAllUnits } from "@/lib/db/public-queries"
import {
  fetchCourseWithAoS,
  listAvailableYears,
  listCoursesForPicker,
  listUserPlans,
  getUserPlanById,
} from "@/lib/db/queries"
import type { PlannerCourseWithAoS, PlannerState } from "@/lib/planner/types"
import type { TreeControlsValue } from "@/lib/tree/payload"
import { prefetchTreeData } from "@/lib/tree/prefetch"
import type { TreeDirection, TreeMode } from "@/lib/tree/types"

import { TreeView } from "@/components/tree/tree-view"

const TREE_DESCRIPTION =
  "Explore the Monash prerequisite graph: visualise every unit your course unlocks, trace prereq chains upstream and downstream, and see which units a course's specialisation requires."

export const metadata: Metadata = {
  title: "Unit tree — prereq graph explorer",
  description: TREE_DESCRIPTION,
  alternates: { canonical: "/tree" },
  openGraph: {
    title: "Unit tree — Monash prereq graph explorer",
    description: TREE_DESCRIPTION,
    type: "website",
    url: "/tree",
  },
  twitter: {
    card: "summary_large_image",
    title: "Unit tree — Monash prereq graph explorer",
    description: TREE_DESCRIPTION,
  },
}

/**
 * Server shell for `/tree`. Resolves an initial controls value from
 * the URL (?course=, ?aos=, ?unit=, ?direction=, ?year=) and pre-runs
 * the first graph fetch so the page is rendered with content on first
 * paint. The client orchestrator (TreeView) takes over from there.
 *
 * Initial course resolution: ?course= > active plan's courseCode >
 * none (renders EmptyState prompting the user to pick a course).
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
    plan?: string
  }>
}) {
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

  // Initial controls — URL beats active plan beats nothing. With no
  // course resolved the page renders an EmptyState prompting the user
  // to pick one, rather than silently landing on a hardcoded default.
  const initialMode: TreeMode = params.unit ? "unit" : "course"
  const initialDirection: TreeDirection =
    params.direction === "downstream" || params.direction === "both"
      ? params.direction
      : "upstream"
  const resolvedCourse =
    initialMode === "course"
      ? (params.course ?? activePlan?.courseCode ?? null)
      : null
  const initialControls: TreeControlsValue = {
    mode: initialMode,
    courseCode: resolvedCourse,
    aosCode: initialMode === "course" ? (params.aos ?? null) : null,
    unitCode: initialMode === "unit" ? (params.unit ?? null) : null,
    direction: initialDirection,
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

  const [courses, allUnits] = await Promise.all([
    listCoursesForPicker(null, 500, year),
    listAllUnits(year),
  ])

  // Curated entry-level units to surface on the empty-state facts
  // card. First 18 L1 units (sorted by code) covers FIT / MTH / ENG /
  // BIO / CHM and gives Googlebot a fan-out of anchor links from /tree.
  const featured = allUnits
    .filter((u) => u.level === "1")
    .slice(0, 18)
    .map((u) => ({ code: u.code, title: u.title, level: u.level }))

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
      featured={featured}
    />
  )
}
