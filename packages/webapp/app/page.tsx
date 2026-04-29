import { Planner } from "@/components/planner/planner"
import { HANDBOOK_YEAR } from "@/lib/db/client"
import {
  fetchCourseWithAoS,
  hydratePlannerUnits,
  listAvailableYears,
  listCoursesForPicker,
} from "@/lib/db/queries"

/**
 * Server-component shell. We fetch the picker's course list and
 * pre-warm the default course (C2000 — BIT, the pedagogical default)
 * so the planner can render immediately with its AoS dropdowns and
 * requirements panel hydrated.
 *
 * The selected handbook year comes from `?year=2022` (URL search param)
 * so it survives navigation; defaults to the most recent year that has
 * data in the DB.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const DEFAULT_COURSE = "C2000"

  const params = await searchParams
  const availableYears = await listAvailableYears()
  // Most recent year wins as default; fall back to HANDBOOK_YEAR if
  // the DB is empty (fresh setup).
  const fallbackYear = availableYears.at(-1) ?? HANDBOOK_YEAR
  const requestedYear = params.year
  const year =
    requestedYear && availableYears.includes(requestedYear)
      ? requestedYear
      : fallbackYear

  const [courses, defaultCourse] = await Promise.all([
    listCoursesForPicker(null, 300, year),
    fetchCourseWithAoS(DEFAULT_COURSE, year),
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
      />
    </main>
  )
}
