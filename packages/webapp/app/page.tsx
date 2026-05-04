import { Planner } from "@/components/planner/planner"
import { getCurrentUser } from "@/lib/auth-server"
import { HANDBOOK_YEAR } from "@/lib/db/client"
import {
  fetchCourseWithAoS,
  getUserPlanById,
  hydratePlannerUnits,
  listAvailableYears,
  listCoursesForPicker,
  listUserPlans,
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
  searchParams: Promise<{ year?: string }>
}) {
  const DEFAULT_COURSE = "C2000"

  const [params, availableYears, currentUser] = await Promise.all([
    searchParams,
    listAvailableYears(),
    getCurrentUser(),
  ])

  // Signed-in users: list their plans, pick the most-recently-updated
  // as the active one. Anon users get an empty list and no active plan.
  const userPlans = currentUser ? await listUserPlans(currentUser.id) : []
  const activePlanId = userPlans[0]?.id ?? null
  const activePlan =
    currentUser && activePlanId
      ? await getUserPlanById(activePlanId, currentUser.id)
      : null
  const initialPlanState = activePlan?.state ?? null

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

  // Eagerly load unit data for every unit referenced by the default
  // course's AoS. Cheap (~100 codes × 3 queries) and means the UI has
  // fully-resolved unit chips the instant you click "add unit".
  const hydrated = await hydratePlannerUnits(prewarmCodes, year)

  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-5 px-5 pt-5 pb-12">
      <Planner
        initialYear={year}
        availableYears={availableYears.length > 0 ? availableYears : [year]}
        courses={courses}
        defaultCourse={defaultCourse}
        prewarmed={{
          units: Object.fromEntries(hydrated.units),
          offerings: Object.fromEntries(hydrated.offerings),
          requisites: Object.fromEntries(hydrated.requisites),
        }}
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
      />
    </main>
  )
}
