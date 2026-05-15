import { Suspense } from "react"

import { PlannerSkeleton } from "@/components/planner/planner-skeleton"
import { PlannerStreaming } from "@/components/planner/planner-streaming"
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
 *   3. most recent year in the DB, default course (C2000 — BIT)
 *
 * Prewarming the *saved* course (not the default) for signed-in users
 * means a returning user lands on their plan with no client-side
 * refetch needed.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; plan?: string }>
}) {
  const DEFAULT_COURSE = "C2000"

  const [params, availableYears, currentUser] = await Promise.all([
    searchParams as Promise<{ year?: string; plan?: string }>,
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

  // Pick the course to prewarm: explicit URL beats saved plan beats default.
  const courseCode =
    (!explicitYear && initialPlanState?.courseCode) || DEFAULT_COURSE

  const [courses, defaultCourse] = await Promise.all([
    listCoursesForPicker(null, 300, year),
    fetchCourseWithAoS(courseCode, year),
  ])

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
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-5 px-5 pt-5 pb-12">
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
        />
      </Suspense>
    </main>
  )
}
