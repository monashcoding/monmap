import type { Metadata } from "next"

import { HubPage, type HubGroup } from "@/components/handbook/hub-page"
import { listCurrentCourses } from "@/lib/db/handbook"
import { listAvailableYears } from "@/lib/db/queries"

// Rendered per request (the build has no database); the list query is
// memoised in process.
export const dynamic = "force-dynamic"

const DESCRIPTION =
  "Every current Monash University course, from bachelor degrees to masters, with student ratings. Open any course for reviews, its structure, majors and a course map planner."

export const metadata: Metadata = {
  title: "Monash Courses: Reviews, Structures & Course Maps",
  description: DESCRIPTION,
  alternates: { canonical: "/courses" },
  openGraph: {
    title: "Monash Courses: Reviews, Structures & Course Maps",
    description: DESCRIPTION,
    url: "/courses",
  },
}

/** "Bachelor Degree" from "Level 7 - Bachelor Degree / ...". */
function qualification(aqf: string | null): string {
  return (
    aqf
      ?.split(" / ")[0]
      ?.replace(/^Level \d+ - /, "")
      .replace(/’/g, "'")
      .trim() || "Other"
  )
}

// Undergraduate first, then honours, then postgraduate.
const ORDER = [
  "Diploma",
  "Associate Degree",
  "Bachelor Degree",
  "Bachelor Honours Degree",
  "Graduate Certificate",
  "Graduate Diploma",
  "Master's Degree (Coursework)",
  "Master's Degree (Extended)",
  "Master's Degree (Research)",
  "Doctoral Degree",
  "Higher Doctoral Degree",
]

export default async function CoursesHub() {
  const [courses, years] = await Promise.all([
    listCurrentCourses(),
    listAvailableYears(),
  ])
  const byGroup = new Map<string, typeof courses>()
  for (const c of courses) {
    const q = qualification(c.group)
    byGroup.set(q, [...(byGroup.get(q) ?? []), c])
  }
  const rank = (q: string) => {
    const i = ORDER.indexOf(q)
    return i === -1 ? ORDER.length : i
  }
  const groups: HubGroup[] = [...byGroup]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([label, list]) => ({
      id: label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-$/, ""),
      label,
      rows: list
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((c) => ({
          kind: "course" as const,
          code: c.code,
          title: c.title,
          note: c.creditPoints ? `${c.creditPoints} cp` : null,
        })),
    }))
  return (
    <HubPage
      year={years.at(-1) ?? "2027"}
      title="Monash courses"
      crumb="Courses"
      path="/courses"
      intro={`All ${courses.length.toLocaleString("en-AU")} current Monash University courses, grouped by qualification, with student ratings. Open a course for its reviews, structure and majors, or plan it semester by semester in the MonMap planner.`}
      groups={groups}
    />
  )
}
