import type { PlannerYearData } from "@/lib/api/client"
import {
  EMPTY_CACHE,
  HANDBOOK_CACHE,
  json,
  knownYear,
  NOTHING_HYDRATED,
  plain,
  searchParams,
} from "@/lib/api/server"
import { isCode } from "@/lib/db/input"
import {
  fetchCourseWithAoS,
  hydratePlannerUnits,
  listCoursesForPicker,
} from "@/lib/db/queries"
import { plannerUnitCodes } from "@/lib/planner/types"

/**
 * Everything the planner needs after a year or plan switch, in one
 * round trip: the course list (when `courses=1`), the course, and unit
 * data for every unit the course can place. The course list and the
 * course load in parallel.
 *
 * GET /api/planner-year?year=2026&course=C2001&courses=1
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const params = searchParams(req)
  const year = await knownYear(params.get("year"))
  const courseCode = params.get("course")
  if (!year) {
    const empty: PlannerYearData = {
      courses: null,
      course: null,
      ...NOTHING_HYDRATED,
    }
    return json(empty, EMPTY_CACHE)
  }
  const [courses, course] = await Promise.all([
    params.get("courses") === "1"
      ? listCoursesForPicker(null, 500, year)
      : null,
    isCode(courseCode) ? fetchCourseWithAoS(courseCode, year) : null,
  ])
  if (!course) {
    const body: PlannerYearData = { courses, course: null, ...NOTHING_HYDRATED }
    // A course that was asked for and not found is an empty answer.
    return json(body, courseCode ? EMPTY_CACHE : HANDBOOK_CACHE)
  }
  const body: PlannerYearData = {
    courses,
    course,
    ...plain(await hydratePlannerUnits(plannerUnitCodes(course), year)),
  }
  return json(body, HANDBOOK_CACHE)
}
