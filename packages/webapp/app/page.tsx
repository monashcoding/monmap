import { Suspense } from "react"

import { PlannerSkeleton } from "@/components/planner/planner-skeleton"
import { PlannerStreaming } from "@/components/planner/planner-streaming"
import { HomeAbout } from "@/components/home-about"
import { getCurrentUser } from "@/lib/auth-server"
import { HANDBOOK_YEAR } from "@/lib/db/client"
import {
  fetchCourseWithAoS,
  hydratePlannerUnits,
  listAvailableYears,
  listCoursesForPicker,
  listUserGrades,
  listUserPlansWithState,
} from "@/lib/db/queries"

/**
 * Server-component shell. Fetches the picker list and pre-warms units
 * so the planner renders fully populated.
 *
 * Year/course resolution order:
 *   1. ?year=… search param — explicit override
 *   2. signed-in user's saved plan — open it where they left off
 *   3. most recent year in the DB, no course (planner renders empty,
 *      prompting the user to pick one)
 *
 * Prewarming the *saved* course (when there is one) means a returning
 * user lands on their plan with no client-side refetch needed.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; plan?: string; course?: string }>
}) {
  const [params, availableYears, currentUser] = await Promise.all([
    searchParams as Promise<{ year?: string; plan?: string; course?: string }>,
    listAvailableYears(),
    getCurrentUser(),
  ])

  // Signed-in users: list their plans (with state) in one round-trip,
  // pick the most-recently-updated as the active one. Anon users get an
  // empty list and no active plan.
  const [fullPlans, initialGrades] = currentUser
    ? await Promise.all([
        listUserPlansWithState(currentUser.id),
        listUserGrades(currentUser.id),
      ])
    : [[], null]
  // Client only needs metadata; strip state before serialising the list.
  const userPlans = fullPlans.map((p) => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
  }))
  // ?plan=<id> lets the plans page link directly to a specific plan.
  const requestedPlanId = params.plan ?? null
  const activePlanId =
    requestedPlanId && fullPlans.some((p) => p.id === requestedPlanId)
      ? requestedPlanId
      : (fullPlans[0]?.id ?? null)
  const initialPlanState =
    fullPlans.find((p) => p.id === activePlanId)?.state ?? null

  // Most recent year wins as default; fall back to HANDBOOK_YEAR if
  // the DB is empty (fresh setup).
  const fallbackYear = availableYears.at(-1) ?? HANDBOOK_YEAR
  const requestedYear = params.year
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

  // Pick the course to prewarm: saved plan unless the user explicitly
  // picked a year (their plan may not match that year). No hardcoded
  // fallback — if there's no plan, the planner renders without a
  // pre-selected course and the user picks one from the rail.
  //
  // ?course=… (the "Plan this course" button on course pages) opens
  // that course when there's no saved plan to show. Over a saved plan
  // the planner offers the switch instead (see PlannerProvider).
  const courses = await listCoursesForPicker(null, 500, year)
  const rawCourse = params.course?.trim().toUpperCase() ?? null
  const requestedCourse =
    rawCourse && courses.some((c) => c.code === rawCourse) ? rawCourse : null
  const courseCode =
    requestedCourse && !initialPlanState
      ? requestedCourse
      : !explicitYear
        ? (initialPlanState?.courseCode ?? null)
        : null

  const defaultCourse = courseCode
    ? await fetchCourseWithAoS(courseCode, year)
    : null

  const prewarmCodes = defaultCourse
    ? [
        ...new Set([
          ...defaultCourse.areasOfStudy.flatMap((a) =>
            a.units.map((u) => u.code)
          ),
          ...defaultCourse.courseUnits.map((u) => u.code),
        ]),
      ]
    : []

  // Build (don't await) the unit-hydration payload so React streams the
  // page shell first. The promise is consumed inside PlannerStreaming
  // via React 19 `use()`; the surrounding <Suspense> renders the
  // skeleton until it resolves.
  const prewarmedPromise = hydratePlannerUnits(prewarmCodes, year).then(
    (h) => ({
      units: Object.fromEntries(h.units),
      offerings: Object.fromEntries(h.offerings),
      requisites: Object.fromEntries(h.requisites),
    })
  )

  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-24 sm:gap-5 sm:px-5 sm:pt-5 sm:pb-12">
      {/* The planner has no visible page title; this names the page for
          search engines and screen readers. */}
      <h1 className="sr-only">
        MonMap: Monash course planner, unit reviews and prerequisite maps
      </h1>
      <Suspense fallback={<PlannerSkeleton />}>
        <PlannerStreaming
          initialYear={year}
          availableYears={availableYears.length > 0 ? availableYears : [year]}
          courses={courses}
          defaultCourse={defaultCourse}
          prewarmedPromise={prewarmedPromise}
          currentUser={
            currentUser
              ? {
                  id: currentUser.id,
                  name: currentUser.name,
                  email: currentUser.email,
                  image: currentUser.image ?? null,
                }
              : null
          }
          initialPlan={initialPlanState}
          initialPlans={userPlans}
          initialActivePlanId={activePlanId}
          initialGrades={initialGrades}
          requestedCourse={requestedCourse}
        />
      </Suspense>
      <HomeAbout />
    </main>
  )
}
