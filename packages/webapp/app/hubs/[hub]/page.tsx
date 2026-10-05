import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { HubPage, type HubGroup } from "@/components/handbook/hub-page"
import { listCurrentAos, listCurrentCourses } from "@/lib/db/handbook"
import { latestHandbookYear } from "@/lib/db/queries"
import { qualification } from "@/lib/handbook/facts"
import { aosKind, type AosKind } from "@/lib/handbook/kinds"

// The /courses and /aos hubs. next.config.mjs rewrites both URLs here
// so they can be cached for a day (ISR) like the pages they list: a
// plain app/courses/page.tsx with `revalidate` would render at build
// time, and the build has no database.
export const revalidate = 86400
export function generateStaticParams() {
  return []
}

type Hub = "courses" | "aos"

const COURSES_DESCRIPTION =
  "Every current Monash University course, from bachelor degrees to masters, with student ratings. Open any course for reviews, its structure, majors and a course map planner."

const AOS_DESCRIPTION =
  "Every current Monash University major, minor and specialisation, with student ratings. Open one for its reviews, units, requisite map and the courses that offer it."

const METADATA: Record<Hub, Metadata> = {
  courses: {
    title: "Monash Courses: Reviews, Structures & Course Maps",
    description: COURSES_DESCRIPTION,
    alternates: { canonical: "/courses" },
    openGraph: {
      title: "Monash Courses: Reviews, Structures & Course Maps",
      description: COURSES_DESCRIPTION,
      url: "/courses",
    },
  },
  aos: {
    title: "Monash Majors, Minors & Specialisations: Reviews & Units",
    description: AOS_DESCRIPTION,
    alternates: { canonical: "/aos" },
    openGraph: {
      title: "Monash Majors, Minors & Specialisations: Reviews & Units",
      description: AOS_DESCRIPTION,
      url: "/aos",
    },
  },
}

const isHub = (hub: string): hub is Hub => hub === "courses" || hub === "aos"

type Props = { params: Promise<{ hub: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hub } = await params
  if (!isHub(hub)) notFound()
  return METADATA[hub]
}

export default async function HubRoute({ params }: Props) {
  const { hub } = await params
  if (hub === "courses") return <CoursesHub />
  if (hub === "aos") return <AosHub />
  notFound()
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

async function CoursesHub() {
  const [courses, year] = await Promise.all([
    listCurrentCourses(),
    latestHandbookYear(),
  ])
  const byGroup = new Map<string, typeof courses>()
  for (const c of courses) {
    // The handbook types some apostrophes curly; group them as one.
    const q = qualification(c.group)?.replace(/’/g, "'").trim() || "Other"
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
      year={year}
      title="Monash courses"
      crumb="Courses"
      path="/courses"
      intro={`All ${courses.length.toLocaleString("en-AU")} current Monash University courses, grouped by qualification, with student ratings. Open a course for its reviews, structure and majors, or plan it semester by semester in the MonMap planner.`}
      groups={groups}
    />
  )
}

// The hub lists minors before specialisations and calls electives
// streams; course pages follow the handbook's order and words.
const AOS_GROUPS: Array<{ kind: AosKind; label?: string }> = [
  { kind: "major" },
  { kind: "extended_major" },
  { kind: "minor" },
  { kind: "specialisation" },
  { kind: "elective", label: "Elective streams" },
  { kind: "other" },
]

async function AosHub() {
  const [aos, year] = await Promise.all([
    listCurrentAos(),
    latestHandbookYear(),
  ])
  const groups: HubGroup[] = AOS_GROUPS.map(({ kind, label }) => ({
    id: kind.replace("_", "-"),
    label: label ?? aosKind(kind)!.plural,
    rows: aos
      .filter((a) =>
        kind === "other"
          ? !aosKind(a.group) || a.group === "other"
          : a.group === kind
      )
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((a) => ({
        kind: "aos" as const,
        code: a.code,
        title: a.title,
        note: a.school?.replace(/^Faculty of /, "") ?? null,
      })),
  }))
  return (
    <HubPage
      year={year}
      title="Monash majors, minors and specialisations"
      crumb="Areas of study"
      path="/aos"
      intro={`All ${aos.length.toLocaleString("en-AU")} current areas of study at Monash University, with student ratings. Open one for its reviews, its units and requisite map, and the courses you can take it in.`}
      groups={groups}
    />
  )
}
