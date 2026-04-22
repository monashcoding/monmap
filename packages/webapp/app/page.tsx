import { Planner } from "@/components/planner/planner"
import {
  fetchCourseWithAoS,
  hydratePlannerUnits,
  listCoursesForPicker,
} from "@/lib/db/queries"

/**
 * Server-component shell. We fetch the picker's course list and
 * pre-warm the default course (C2000 — BIT, the pedagogical default)
 * so the planner can render immediately with its AoS dropdowns and
 * requirements panel hydrated.
 */
export default async function Page() {
  const DEFAULT_COURSE = "C2000"

  const [courses, defaultCourse] = await Promise.all([
    listCoursesForPicker(null, 300),
    fetchCourseWithAoS(DEFAULT_COURSE),
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
  const hydrated = await hydratePlannerUnits(prewarmCodes)

  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-5 px-5 pt-5 pb-12">
      <Planner
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
