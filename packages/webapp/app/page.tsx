import type { Metadata } from "next"
import { Suspense } from "react"

import { PlannerSkeleton } from "@/components/planner/planner-skeleton"
import { PlannerStreaming } from "@/components/planner/planner-streaming"
import { HomeAbout } from "@/components/home-about"
import { getCurrentUser } from "@/lib/auth-server"
import { isCode } from "@/lib/db/input"
import {
  fetchCourseWithAoS,
  getActiveUserPlan,
  hydratePlannerUnits,
  hydratePlannerUnitsMultiYear,
  latestHandbookYear,
  listAvailableYears,
  listCoursesForPicker,
  listUserGrades,
  listUserPlans,
} from "@/lib/db/queries"
import { firstParam } from "@/lib/handbook/search-url"
import { codesToHydrate } from "@/lib/planner/hydration"
import { plannerUnitCodes, type PlannerState } from "@/lib/planner/types"

// Only the home page claims "/" as canonical; a layout-level canonical
// would leak onto every page without its own, 404s included. Query
// variants (?course=, ?year=, ?plan=) are the same page.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

// A repeated key (?plan=a&plan=b) arrives as an array; firstParam
// takes its first value.
type SearchParams = {
  year?: string | string[]
  plan?: string | string[]
  course?: string | string[]
}

/**
 * Page shell. Nothing here waits on data: the heading, the skeleton
 * and the about section stream in the first chunk, and PlannerData
 * fills the boundary once the user, plan and course are loaded. The
 * about section's popular-courses list has its own boundary.
 */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-24 sm:gap-5 sm:px-5 sm:pt-5 sm:pb-12">
      {/* The planner has no visible page title; this names the page for
          search engines and screen readers. */}
      <h1 className="sr-only">
        MonMap: Monash course planner, unit reviews and prerequisite maps
      </h1>
      <Suspense fallback={<PlannerSkeleton />}>
        <PlannerData searchParams={searchParams} />
      </Suspense>
      <HomeAbout />
    </main>
  )
}

/**
 * Fetches the picker list and pre-warms units so the planner renders
 * fully populated.
 *
 * Year/course resolution order:
 *   1. ?year=… search param — explicit override
 *   2. signed-in user's saved plan — open it where they left off
 *   3. most recent year in the DB, no course (planner renders empty,
 *      prompting the user to pick one)
 *
 * Prewarming the *saved* course and the plan's own units (when there
 * is a plan) means a returning user lands on their plan with no
 * client-side refetch needed.
 */
async function PlannerData({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [params, availableYears, fallbackYear, currentUser] = await Promise.all(
    [searchParams, listAvailableYears(), latestHandbookYear(), getCurrentUser()]
  )

  // Signed-in users: their plan list (no state) and the active plan's
  // state, in parallel. ?plan=<id> lets the plans page link directly to
  // a specific plan; otherwise the most recently updated one opens.
  // Anon users get an empty list and no active plan.
  const requestedPlanId = firstParam(params.plan)
  const [userPlans, activePlan, initialGrades] = currentUser
    ? await Promise.all([
        listUserPlans(currentUser.id),
        getActiveUserPlan(currentUser.id, requestedPlanId),
        listUserGrades(currentUser.id),
      ])
    : [[], null, null]
  const activePlanId = activePlan?.id ?? null
  const initialPlanState = activePlan?.state ?? null

  // Most recent year wins as default (the calendar year on an empty
  // database).
  const requestedYear = firstParam(params.year)
  const explicitYear =
    requestedYear && availableYears.includes(requestedYear)
      ? requestedYear
      : null
  const planYear =
    initialPlanState?.courseYear &&
    availableYears.includes(initialPlanState.courseYear)
      ? initialPlanState.courseYear
      : null
  const year = explicitYear ?? planYear ?? fallbackYear
  const clientYears = availableYears.length > 0 ? availableYears : [year]

  // Pick the course to prewarm: saved plan unless the user explicitly
  // picked a year (their plan may not match that year). No hardcoded
  // fallback — if there's no plan, the planner renders without a
  // pre-selected course and the user picks one from the rail.
  //
  // ?course=… (the "Plan this course" button on course pages) opens
  // that course when there's no saved plan to show. Over a saved plan
  // the planner offers the switch instead (see PlannerProvider).
  const rawCourse = firstParam(params.course)?.toUpperCase() ?? null
  const wantedCourse = initialPlanState
    ? !explicitYear
      ? (initialPlanState.courseCode ?? null)
      : null
    : isCode(rawCourse)
      ? rawCourse
      : null
  // The course list and the course load in parallel.
  const [courses, wantedCourseData] = await Promise.all([
    listCoursesForPicker(null, 500, year),
    wantedCourse ? fetchCourseWithAoS(wantedCourse, year) : null,
  ])
  const requestedCourse =
    rawCourse && courses.some((c) => c.code === rawCourse) ? rawCourse : null
  const defaultCourse =
    initialPlanState || requestedCourse ? wantedCourseData : null

  // Build (don't await) the unit-hydration payload so React streams the
  // planner before unit data arrives. The promise is consumed inside
  // PlannerStreaming via React 19 `use()`.
  const prewarmedPromise = prewarm({
    codes: defaultCourse ? plannerUnitCodes(defaultCourse) : [],
    year,
    // The client keeps this prewarm only when the plan opens on the
    // year and course it was built for (PlannerProvider's mount check).
    plan:
      initialPlanState &&
      initialPlanState.courseYear === year &&
      (initialPlanState.courseCode ?? null) === (defaultCourse?.code ?? null)
        ? initialPlanState
        : null,
    availableYears: clientYears,
  })

  return (
    <PlannerStreaming
      initialYear={year}
      availableYears={clientYears}
      courses={courses}
      defaultCourse={defaultCourse}
      prewarmedPromise={prewarmedPromise}
      // Only the name: the client never needs the id or email.
      currentUser={currentUser ? { name: currentUser.name } : null}
      initialPlan={initialPlanState}
      initialPlans={userPlans}
      initialActivePlanId={activePlanId}
      initialGrades={initialGrades}
      requestedCourse={requestedCourse}
    />
  )
}

/**
 * Unit data for the course's units from `year`, plus the plan's placed
 * and credited units from the handbook year each study year reads
 * (codesToHydrate, the client's own rule), fetched in parallel. With
 * both in the payload the client's hydration hook finds nothing to
 * fetch on mount.
 */
async function prewarm({
  codes,
  year,
  plan,
  availableYears,
}: {
  codes: string[]
  year: string
  plan: PlannerState | null
  availableYears: string[]
}) {
  const none = new Map<string, never>()
  const planCodes = plan
    ? codesToHydrate({
        state: plan,
        availableYears,
        units: none,
        offerings: none,
        requisites: none,
        empty: new Set(),
      })
    : new Map<string, string[]>()
  // Course-year codes the course list already covers need no second
  // fetch.
  const courseCodes = new Set(codes)
  const rest = new Map(
    [...planCodes]
      .map(
        ([y, cs]) =>
          [y, y === year ? cs.filter((c) => !courseCodes.has(c)) : cs] as const
      )
      .filter(([, cs]) => cs.length > 0)
  )
  const [course, placed] = await Promise.all([
    hydratePlannerUnits(codes, year),
    hydratePlannerUnitsMultiYear(rest),
  ])
  // Later-year data wins for placed codes, as on the client. Like the
  // client's hydration hook, every placed code with a unit gets
  // offerings and requisites entries (empty when there are none), so
  // the hook does not ask for it again.
  const units = Object.fromEntries([...course.units, ...placed.units])
  const offerings = Object.fromEntries([
    ...course.offerings,
    ...placed.offerings,
  ])
  const requisites = Object.fromEntries([
    ...course.requisites,
    ...placed.requisites,
  ])
  for (const code of [...planCodes.values()].flat()) {
    if (!units[code]) continue
    offerings[code] ??= []
    requisites[code] ??= []
  }
  return { units, offerings, requisites }
}
