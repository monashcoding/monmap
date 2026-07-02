/**
 * Queries for the public entity overviews (the facts panel below the
 * /tree workbench, via `fetchEntityDetailsAction`). Kept separate from
 * the planner's queries.ts so this surface stays narrow and doesn't
 * accidentally pull planner-specific columns.
 */
import {
  areaOfStudyUnits,
  areasOfStudy,
  courseAreasOfStudy,
  courses,
  requisiteRefs,
  unitOfferings,
  units,
} from "@monmap/db"
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import { getDb, HANDBOOK_YEAR } from "./client.ts"
import { cacheHandbook } from "./memo.ts"

export interface UnitListItem {
  code: string
  title: string
  creditPoints: number
  level: string | null
  school: string | null
}

export interface CourseListItem {
  code: string
  title: string
  creditPoints: number
  aqfLevel: string | null
  type: string | null
}

async function _listAllUnits(year: string): Promise<UnitListItem[]> {
  const db = getDb()
  const rows = await db
    .select({
      code: units.code,
      title: units.title,
      creditPoints: units.creditPoints,
      level: units.level,
      school: units.school,
    })
    .from(units)
    .where(eq(units.year, year))
    .orderBy(asc(units.code))
  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    level: r.level,
    school: r.school,
  }))
}
export const listAllUnits = cacheHandbook(_listAllUnits)

export interface PublicUnit {
  year: string
  code: string
  title: string
  creditPoints: number
  level: string | null
  type: string | null
  status: string | null
  undergradPostgrad: string | null
  school: string | null
  academicOrg: string | null
  /** HTML synopsis from the Monash handbook. Rendered with explicit
   *  attribution + a link back to the canonical handbook entry. */
  handbookSynopsis: string | null
  offerings: Array<{
    teachingPeriod: string | null
    location: string | null
    attendanceMode: string | null
    attendanceModeCode: string | null
  }>
  /** Codes of units this one lists as a prerequisite, corequisite, or prohibition. */
  requisites: Array<{
    requisiteType: string
    requiresUnitCode: string
    requiresTitle: string | null
  }>
  /** Codes of units that list this one as a prerequisite or corequisite. */
  unlocks: Array<{
    requisiteType: string
    unitCode: string
    title: string | null
  }>
  /** Areas of study that include this unit. */
  partOfAreasOfStudy: Array<{
    code: string
    title: string
    grouping: string
  }>
}

async function _fetchPublicUnit(
  code: string,
  year: string
): Promise<PublicUnit | null> {
  const db = getDb()
  const [unit] = await db
    .select({
      year: units.year,
      code: units.code,
      title: units.title,
      creditPoints: units.creditPoints,
      level: units.level,
      type: units.type,
      status: units.status,
      undergradPostgrad: units.undergradPostgrad,
      school: units.school,
      academicOrg: units.academicOrg,
      handbookSynopsis: units.handbookSynopsis,
    })
    .from(units)
    .where(and(eq(units.year, year), eq(units.code, code)))
    .limit(1)
  if (!unit) return null

  const [offeringRows, forwardRefs, reverseRefs, aosRows] = await Promise.all([
    db
      .select({
        teachingPeriod: unitOfferings.teachingPeriod,
        location: unitOfferings.location,
        attendanceMode: unitOfferings.attendanceMode,
        attendanceModeCode: unitOfferings.attendanceModeCode,
      })
      .from(unitOfferings)
      .where(
        and(
          eq(unitOfferings.year, year),
          eq(unitOfferings.unitCode, code),
          eq(unitOfferings.offered, true)
        )
      ),
    db
      .select({
        requisiteType: requisiteRefs.requisiteType,
        requiresUnitCode: requisiteRefs.requiresUnitCode,
      })
      .from(requisiteRefs)
      .where(
        and(eq(requisiteRefs.year, year), eq(requisiteRefs.unitCode, code))
      ),
    db
      .select({
        requisiteType: requisiteRefs.requisiteType,
        unitCode: requisiteRefs.unitCode,
      })
      .from(requisiteRefs)
      .where(
        and(
          eq(requisiteRefs.year, year),
          eq(requisiteRefs.requiresUnitCode, code)
        )
      ),
    db
      .select({
        aosCode: areaOfStudyUnits.aosCode,
        grouping: areaOfStudyUnits.grouping,
        title: areasOfStudy.title,
      })
      .from(areaOfStudyUnits)
      .leftJoin(
        areasOfStudy,
        and(
          eq(areaOfStudyUnits.aosYear, areasOfStudy.year),
          eq(areaOfStudyUnits.aosCode, areasOfStudy.code)
        )
      )
      .where(
        and(
          eq(areaOfStudyUnits.aosYear, year),
          eq(areaOfStudyUnits.unitCode, code)
        )
      ),
  ])

  const forwardCodes = forwardRefs.map((r) => r.requiresUnitCode)
  const reverseCodes = reverseRefs.map((r) => r.unitCode)
  const titlesNeeded = [...new Set([...forwardCodes, ...reverseCodes])]
  const titleRows = titlesNeeded.length
    ? await db
        .select({ code: units.code, title: units.title })
        .from(units)
        .where(and(eq(units.year, year), inArray(units.code, titlesNeeded)))
    : []
  const titlesByCode = new Map(titleRows.map((r) => [r.code, r.title]))

  // De-dupe both direction lists — Monash sometimes lists the same unit
  // twice via redundant rule branches; once is enough for SEO copy.
  const reqSeen = new Set<string>()
  const requisites = forwardRefs
    .filter((r) => {
      const key = `${r.requisiteType}:${r.requiresUnitCode}`
      if (reqSeen.has(key)) return false
      reqSeen.add(key)
      return true
    })
    .map((r) => ({
      requisiteType: r.requisiteType,
      requiresUnitCode: r.requiresUnitCode,
      requiresTitle: titlesByCode.get(r.requiresUnitCode) ?? null,
    }))

  const unlockSeen = new Set<string>()
  const unlocks = reverseRefs
    .filter((r) => r.requisiteType !== "prohibition")
    .filter((r) => {
      const key = `${r.requisiteType}:${r.unitCode}`
      if (unlockSeen.has(key)) return false
      unlockSeen.add(key)
      return true
    })
    .map((r) => ({
      requisiteType: r.requisiteType,
      unitCode: r.unitCode,
      title: titlesByCode.get(r.unitCode) ?? null,
    }))

  const aosSeen = new Set<string>()
  const partOfAreasOfStudy = aosRows
    .filter((r) => {
      if (aosSeen.has(r.aosCode)) return false
      aosSeen.add(r.aosCode)
      return true
    })
    .map((r) => ({
      code: r.aosCode,
      title: r.title ?? r.aosCode,
      grouping: r.grouping,
    }))

  return {
    year: unit.year,
    code: unit.code,
    title: unit.title,
    creditPoints: unit.creditPoints ?? 0,
    level: unit.level,
    type: unit.type,
    status: unit.status,
    undergradPostgrad: unit.undergradPostgrad,
    school: unit.school,
    academicOrg: unit.academicOrg,
    handbookSynopsis: unit.handbookSynopsis,
    offerings: offeringRows,
    requisites,
    unlocks,
    partOfAreasOfStudy,
  }
}
export const fetchPublicUnit = cacheHandbook(_fetchPublicUnit)

export interface PublicCourse {
  year: string
  code: string
  title: string
  creditPoints: number
  aqfLevel: string | null
  type: string | null
  school: string | null
  cricosCode: string | null
  onCampus: boolean | null
  online: boolean | null
  fullTime: boolean | null
  partTime: boolean | null
  /** HTML overview from the Monash handbook. */
  overview: string | null
  /** Areas of study attached to this course (real, DB-linked ones only). */
  areasOfStudy: Array<{
    code: string
    title: string
    kind: string
    creditPoints: number | null
    studyLevel: string | null
  }>
}

async function _fetchPublicCourse(
  code: string,
  year: string
): Promise<PublicCourse | null> {
  const db = getDb()
  const [course] = await db
    .select({
      year: courses.year,
      code: courses.code,
      title: courses.title,
      creditPoints: courses.creditPoints,
      aqfLevel: courses.aqfLevel,
      type: courses.type,
      school: courses.school,
      cricosCode: courses.cricosCode,
      onCampus: courses.onCampus,
      online: courses.online,
      fullTime: courses.fullTime,
      partTime: courses.partTime,
      overview: courses.overview,
    })
    .from(courses)
    .where(and(eq(courses.year, year), eq(courses.code, code)))
    .limit(1)
  if (!course) return null

  const aosRows = await db
    .select({
      aosCode: courseAreasOfStudy.aosCode,
      kind: courseAreasOfStudy.kind,
      title: areasOfStudy.title,
      creditPoints: areasOfStudy.creditPoints,
      studyLevel: areasOfStudy.studyLevel,
    })
    .from(courseAreasOfStudy)
    .leftJoin(
      areasOfStudy,
      and(
        eq(courseAreasOfStudy.aosYear, areasOfStudy.year),
        eq(courseAreasOfStudy.aosCode, areasOfStudy.code)
      )
    )
    .where(
      and(
        eq(courseAreasOfStudy.courseYear, year),
        eq(courseAreasOfStudy.courseCode, code)
      )
    )

  const seen = new Set<string>()
  const areasOfStudyList = aosRows
    .filter((r) => {
      if (seen.has(r.aosCode)) return false
      seen.add(r.aosCode)
      return true
    })
    .map((r) => ({
      code: r.aosCode,
      title: r.title ?? r.aosCode,
      kind: r.kind,
      creditPoints: r.creditPoints,
      studyLevel: r.studyLevel,
    }))

  return {
    year: course.year,
    code: course.code,
    title: course.title,
    creditPoints: course.creditPoints ?? 0,
    aqfLevel: course.aqfLevel,
    type: course.type,
    school: course.school,
    cricosCode: course.cricosCode,
    onCampus: course.onCampus,
    online: course.online,
    fullTime: course.fullTime,
    partTime: course.partTime,
    overview: course.overview,
    areasOfStudy: areasOfStudyList,
  }
}
export const fetchPublicCourse = cacheHandbook(_fetchPublicCourse)

async function _listMostRecentYear(): Promise<string> {
  const db = getDb()
  const rows = await db
    .selectDistinct({ year: courses.year })
    .from(courses)
    .orderBy(asc(courses.year))
  return rows.at(-1)?.year ?? HANDBOOK_YEAR
}
export const listMostRecentYear = cacheHandbook(_listMostRecentYear)

export async function searchUnitsForListing(
  query: string,
  year: string,
  limit = 60
): Promise<UnitListItem[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const db = getDb()
  const q = `%${trimmed}%`
  const rows = await db
    .select({
      code: units.code,
      title: units.title,
      creditPoints: units.creditPoints,
      level: units.level,
      school: units.school,
    })
    .from(units)
    .where(
      and(eq(units.year, year), or(ilike(units.code, q), ilike(units.title, q)))
    )
    .orderBy(asc(units.code))
    .limit(limit)
  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    level: r.level,
    school: r.school,
  }))
}

export async function searchCoursesForListing(
  query: string,
  year: string,
  limit = 60
): Promise<CourseListItem[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const db = getDb()
  const q = `%${trimmed}%`
  const rows = await db
    .select({
      code: courses.code,
      title: courses.title,
      creditPoints: courses.creditPoints,
      aqfLevel: courses.aqfLevel,
      type: courses.type,
    })
    .from(courses)
    .where(
      and(
        eq(courses.year, year),
        sql`${courses.creditPoints} > 0`,
        or(ilike(courses.title, q), ilike(courses.code, q))
      )
    )
    .orderBy(asc(courses.title))
    .limit(limit)
  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    aqfLevel: r.aqfLevel,
    type: r.type,
  }))
}
