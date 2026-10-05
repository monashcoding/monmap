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

/** The first item for each key, in order. */
export function uniqueBy<T>(list: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return list.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

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

export function levelNumber(level: string | null): string | null {
  return level?.match(/\d+/)?.[0] ?? null
}

/** "Bachelor Degree" from "Level 7 - Bachelor Degree / Level 7 - ...". */
export function qualification(aqf: string | null): string | null {
  return aqf?.split(" / ")[0]?.replace(/^Level \d+ - /, "") ?? null
}

/**
 * How many units `code` leads to: everything that lists it, or lists
 * one of those, as a prerequisite or corequisite, as far as the graph
 * was expanded (four steps on unit pages).
 */
export function downstreamReach(
  code: string,
  edges: ReadonlyArray<{ from: string; to: string; type: string }>
): number {
  const next = new Map<string, string[]>()
  for (const e of edges) {
    if (e.type !== "prerequisite" && e.type !== "corequisite") continue
    if (e.from === e.to) continue
    next.set(e.to, [...(next.get(e.to) ?? []), e.from])
  }
  const seen = new Set<string>([code])
  const queue = [code]
  while (queue.length) {
    for (const n of next.get(queue.shift()!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  return seen.size - 1
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
  const lvl = levelNumber(u.level)
  return {
    code: u.code,
    title: u.title,
    year: u.year,
    creditPoints: u.creditPoints,
    level: lvl ? Number(lvl) : null,
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
    workloadHours: semesterHours(u),
    // One entry per name: a major and its minor often share a title.
    areasOfStudy: uniqueBy(u.areasOfStudy, (a) => a.title).map((a) => ({
      code: a.code,
      title: a.title,
    })),
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
    // "70; International: ..." leads with the domestic guaranteed ATAR.
    atar: c.atar?.split(";")[0]?.trim() || null,
    aos: uniqueBy(c.areasOfStudy, (a) => a.code).map((a) => ({
      code: a.code,
      title: a.title,
      kind: a.kind,
    })),
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
    courses: uniqueBy(a.courses, (c) => c.code).map((c) => ({
      code: c.code,
      title: c.title,
    })),
    rating,
  }
}
