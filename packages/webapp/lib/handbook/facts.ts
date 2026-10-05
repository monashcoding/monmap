/**
 * Gathers what lib/handbook/summary.ts needs from a page's data, so the
 * page components, metadata and checks share one version.
 */
import type {
  AosPageData,
  CoursePageData,
  UnitPageData,
} from "../db/handbook.ts"
import { PERIOD_KIND_LABEL } from "../planner/teaching-period.ts"
import { stripHtml } from "../seo.ts"
import type {
  AosFacts,
  CourseFacts,
  RatingFacts,
  UnitFacts,
} from "./summary.ts"

export const isExam = (a: { name: string; type: string | null }) =>
  /exam/i.test(`${a.type ?? ""} ${a.name}`)

/**
 * The semester's total hours from the handbook's workload prose, as in
 * "total expected workload ... is 144 hours per semester". Weekly
 * breakdowns vary too much between units to sum safely, so they give
 * nothing.
 */
function semesterHours(u: UnitPageData): number | null {
  const text = stripHtml(u.workload)
  const m =
    text.match(
      /(\d{2,3})\s*hours?\s*(?:per|a|each|in the|across the)\s*(?:teaching\s+)?semester/i
    ) ?? text.match(/total[^.]*?(\d{2,3})\s*hours/i)
  return m ? Number(m[1]) : null
}

/** "144 hours" for the hero, when the handbook gives a semester total. */
export function workloadHours(u: UnitPageData): string | null {
  const n = semesterHours(u)
  return n ? `${n} hours` : null
}

export function levelNumber(level: string | null): string | null {
  return level?.match(/\d+/)?.[0] ?? null
}

/** "Bachelor Degree" from "Level 7 - Bachelor Degree / Level 7 - ...". */
export function qualification(aqf: string | null): string | null {
  return aqf?.split(" / ")[0]?.replace(/^Level \d+ - /, "") ?? null
}

/** What the summary, the questions and the description need to know. */
export function unitFacts(
  u: UnitPageData,
  rating: RatingFacts,
  leadsTo: number
): UnitFacts {
  const rules = (type: string) => {
    const blocks = u.requisites.filter(
      (b) => b.requisiteType === type && b.rule?.length
    )
    return blocks.length ? blocks.flatMap((b) => b.rule ?? []) : null
  }
  const exams = u.assessments.filter(isExam)
  const periods = [...new Set(u.offerings.map((o) => o.periodKind))]
    .filter((k) => k !== "OTHER")
    .map((k) => PERIOD_KIND_LABEL[k])
  const hours = semesterHours(u)
  return {
    code: u.code,
    title: u.title,
    year: u.year,
    creditPoints: u.creditPoints,
    level: levelNumber(u.level) ? Number(levelNumber(u.level)) : null,
    study: u.undergradPostgrad,
    school: u.school,
    periods,
    campuses: [...new Set(u.offerings.flatMap((o) => o.location ?? []))],
    online: u.offerings.some((o) => o.attendanceModeCode === "ONLINE"),
    prerequisites: rules("prerequisite"),
    corequisites: rules("corequisite"),
    hasEnrolmentRules: u.enrolmentRules.length > 0,
    unlocks: [...new Set(u.unlocks.map((x) => x.code))],
    leadsTo,
    examWeight: exams.length
      ? exams.reduce((n, a) => n + (a.weight ?? 0), 0)
      : null,
    assessmentCount: u.assessments.length,
    workloadHours: hours,
    // One entry per name: a major and its minor often share a title.
    areasOfStudy: u.areasOfStudy
      .filter((a, i, all) => all.findIndex((b) => b.title === a.title) === i)
      .map((a) => ({ code: a.code, title: a.title })),
    rating,
  }
}

export function courseFacts(
  c: CoursePageData,
  rating: RatingFacts
): CourseFacts {
  const campuses = c.modes.length
    ? [...new Set(c.modes.flatMap((m) => m.locations))]
    : (c.locations?.split(/,\s*/).filter(Boolean) ?? [])
  return {
    code: c.code,
    title: c.title,
    year: c.year,
    creditPoints: c.creditPoints,
    duration: c.fullTime?.toLowerCase() ?? null,
    qualification: qualification(c.aqfLevel),
    school: c.school,
    campuses,
    atar: c.atar?.split(";")[0]?.trim() || null,
    aos: c.areasOfStudy
      .filter((a, i, all) => all.findIndex((b) => b.code === a.code) === i)
      .map((a) => ({ code: a.code, title: a.title, kind: a.kind })),
    rating,
  }
}

export function aosFacts(a: AosPageData, rating: RatingFacts): AosFacts {
  return {
    code: a.code,
    title: a.title,
    year: a.year,
    kind: a.kind,
    creditPoints: a.creditPoints,
    unitCount: a.unitCodes.length,
    unitCodes: a.unitCodes,
    campuses: a.locations?.split(/,\s*/).filter(Boolean) ?? [],
    courses: a.courses
      .filter((c, i, all) => all.findIndex((d) => d.code === c.code) === i)
      .map((c) => ({ code: c.code, title: c.title })),
    rating,
  }
}
