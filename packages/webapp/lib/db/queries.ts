import {
  areaOfStudyUnits,
  areasOfStudy,
  courseAreasOfStudy,
  courses,
  enrolmentRules,
  requisites,
  unitOfferings,
  units,
} from "@monmap/db"
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm"

import { getDb, HANDBOOK_YEAR } from "./client.ts"
import {
  extractEmbeddedSpecialisations,
  extractRequirementGroups,
  pickDefaultUnits,
  type EmbeddedSpecialisation,
  type RequirementGroup,
} from "./curriculum.ts"
import { classifyTeachingPeriod } from "../planner/teaching-period.ts"
import type {
  PlannerAreaOfStudy,
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
  RequisiteRule,
} from "../planner/types.ts"

/**
 * All queries take a `year` parameter so a student can plan against a
 * different handbook year (e.g. 2022 if they started their degree
 * then). Defaults to HANDBOOK_YEAR for backward compat. Per-row year
 * tracking (each plan year using its own handbook) is not implemented
 * — start year drives everything, matching MonPlan's pragmatic model.
 */

export async function listAvailableYears(): Promise<string[]> {
  const db = getDb()
  const rows = await db.selectDistinct({ year: courses.year }).from(courses)
  return rows.map((r) => r.year).sort()
}

export async function listCoursesForPicker(
  search: string | null,
  limit = 50,
  year: string = HANDBOOK_YEAR
): Promise<PlannerCourse[]> {
  const db = getDb()
  const conds = [eq(courses.year, year), sql`${courses.creditPoints} > 0`]
  if (search && search.trim()) {
    const q = `%${search.trim()}%`
    conds.push(or(ilike(courses.title, q), ilike(courses.code, q))!)
  }
  const rows = await db
    .select({
      year: courses.year,
      code: courses.code,
      title: courses.title,
      creditPoints: courses.creditPoints,
      aqfLevel: courses.aqfLevel,
      type: courses.type,
      overview: courses.overview,
    })
    .from(courses)
    .where(and(...conds))
    .orderBy(courses.title)
    .limit(limit)

  return rows.map((r) => ({
    year: r.year,
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    aqfLevel: r.aqfLevel,
    type: r.type,
    overview: r.overview,
  }))
}

/**
 * Load a course plus the AoS it offers. Groups edges by (year, code)
 * so each AoS appears once even if it's listed under multiple
 * relationshipLabels (rare but possible).
 */
export async function fetchCourseWithAoS(
  code: string,
  year: string = HANDBOOK_YEAR
): Promise<PlannerCourseWithAoS | null> {
  const db = getDb()
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.year, year), eq(courses.code, code)))
    .limit(1)
  if (!course) return null

  // Extract degree-level requirements from the course's
  // curriculumStructure. Intersect against the units table to drop
  // cross-year / dangling refs from both the group options and the
  // flat default-load list.
  const rawCourseGroups = extractRequirementGroups(course.curriculumStructure)
  // Pull embedded specialisations from the same tree — these are
  // "pick one of N" sub-containers (e.g. F2010 Part C studios, C2001
  // Part D tracks) that don't appear in the course_areas_of_study
  // table. They get surfaced to the AoS picker as virtual AoS so the
  // student can choose one and have its units auto-load.
  const embeddedSpecs = extractEmbeddedSpecialisations(
    course.curriculumStructure
  )

  // Collect every code that needs a validity check in one round-trip.
  const allCandidateCodes = new Set<string>()
  for (const g of rawCourseGroups)
    for (const c of g.options) allCandidateCodes.add(c)
  for (const spec of embeddedSpecs)
    for (const g of spec.requirements)
      for (const c of g.options) allCandidateCodes.add(c)

  let valid = new Set<string>()
  if (allCandidateCodes.size > 0) {
    const validRows = await db
      .select({ code: units.code })
      .from(units)
      .where(
        and(eq(units.year, year), inArray(units.code, [...allCandidateCodes]))
      )
    valid = new Set(validRows.map((r) => r.code))
  }

  let courseRequirements: RequirementGroup[] = []
  let courseUnits: { code: string; grouping: string }[] = []
  if (rawCourseGroups.length > 0) {
    courseRequirements = filterGroups(rawCourseGroups, valid)
    courseUnits = pickDefaultUnits(courseRequirements)
  }

  const virtualAos = buildEmbeddedAos(course.code, embeddedSpecs, valid)

  const links = await db
    .select({
      aosCode: courseAreasOfStudy.aosCode,
      aosYear: courseAreasOfStudy.aosYear,
      kind: courseAreasOfStudy.kind,
      relationshipLabel: courseAreasOfStudy.relationshipLabel,
      title: areasOfStudy.title,
      creditPoints: areasOfStudy.creditPoints,
      curriculumStructure: areasOfStudy.curriculumStructure,
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

  if (links.length === 0) {
    return {
      year: course.year,
      code: course.code,
      title: course.title,
      creditPoints: course.creditPoints ?? 0,
      aqfLevel: course.aqfLevel,
      type: course.type,
      overview: course.overview,
      areasOfStudy: virtualAos,
      courseUnits,
      courseRequirements,
    }
  }

  // Build per-AoS requirement groups from each AoS's curriculum.
  const aosGroups = new Map<string, RequirementGroup[]>()
  for (const l of links) {
    if (aosGroups.has(l.aosCode)) continue
    aosGroups.set(l.aosCode, extractRequirementGroups(l.curriculumStructure))
  }

  const aosCodes = [...new Set(links.map((l) => l.aosCode))]
  const unitRows = await db
    .select({
      aosCode: areaOfStudyUnits.aosCode,
      unitCode: areaOfStudyUnits.unitCode,
      grouping: areaOfStudyUnits.grouping,
    })
    .from(areaOfStudyUnits)
    .where(
      and(
        eq(areaOfStudyUnits.aosYear, year),
        inArray(areaOfStudyUnits.aosCode, aosCodes)
      )
    )
    .orderBy(areaOfStudyUnits.grouping, areaOfStudyUnits.unitCode)

  const unitsByAos = new Map<string, { code: string; grouping: string }[]>()
  for (const u of unitRows) {
    const list = unitsByAos.get(u.aosCode) ?? []
    list.push({ code: u.unitCode, grouping: u.grouping })
    unitsByAos.set(u.aosCode, list)
  }

  // De-duplicate course→AoS edges that share (code, kind) — first label wins
  const byCode = new Map<string, PlannerAreaOfStudy>()
  for (const l of links) {
    if (byCode.has(l.aosCode)) continue
    const allUnits = unitsByAos.get(l.aosCode) ?? []
    const groups = aosGroups.get(l.aosCode) ?? []
    // Fall back to treating every listed unit as required if the AoS
    // has no curriculumStructure (rare — but seen on a few AoS).
    let requirements: RequirementGroup[]
    let requiredUnits: { code: string; grouping: string }[]
    if (groups.length > 0) {
      requirements = groups
      requiredUnits = pickDefaultUnits(groups)
    } else {
      requirements = groupsFromFlat(allUnits)
      requiredUnits = allUnits
    }
    byCode.set(l.aosCode, {
      code: l.aosCode,
      title: l.title ?? l.aosCode,
      kind: l.kind,
      relationshipLabel: l.relationshipLabel,
      creditPoints: l.creditPoints,
      units: allUnits,
      requiredUnits,
      requirements,
    })
  }

  // Append virtual (curriculum-tree-embedded) AoS — they coexist with
  // DB-linked AoS without conflict because real AoS use codes like
  // CSCYBSEC01 while virtual ones are namespaced as "C2001:part-d:...".
  const combined = [...byCode.values(), ...virtualAos]
  const orderedAos = combined.sort((a, b) => {
    if (a.kind !== b.kind) return kindOrder(a.kind) - kindOrder(b.kind)
    return a.title.localeCompare(b.title)
  })

  return {
    year: course.year,
    code: course.code,
    title: course.title,
    creditPoints: course.creditPoints ?? 0,
    aqfLevel: course.aqfLevel,
    type: course.type,
    overview: course.overview,
    areasOfStudy: orderedAos,
    courseUnits,
    courseRequirements,
  }
}

/**
 * Convert curriculum-tree embedded specialisations into virtual
 * `PlannerAreaOfStudy` records the planner UI can treat like any other
 * AoS. The synthetic code shape — `${courseCode}:${parentSlug}:${slug}` —
 * is stable across page loads so localStorage saves continue to work.
 */
function buildEmbeddedAos(
  courseCode: string,
  specs: readonly EmbeddedSpecialisation[],
  validCodes: ReadonlySet<string>
): PlannerAreaOfStudy[] {
  const out: PlannerAreaOfStudy[] = []
  for (const spec of specs) {
    const requirements = filterGroups(spec.requirements, validCodes)
    if (requirements.length === 0) continue
    const allUnits: { code: string; grouping: string }[] = []
    const seen = new Set<string>()
    for (const g of requirements) {
      for (const c of g.options) {
        const key = `${c}|${g.grouping}`
        if (seen.has(key)) continue
        seen.add(key)
        allUnits.push({ code: c, grouping: g.grouping })
      }
    }
    out.push({
      code: `${courseCode}:${spec.parentSlug}:${spec.slug}`,
      title: spec.title,
      kind: "specialisation",
      relationshipLabel: spec.parentTitle,
      creditPoints: spec.creditPoints,
      units: allUnits,
      requiredUnits: pickDefaultUnits(requirements),
      requirements,
    })
  }
  return out
}

function filterGroups(
  groups: readonly RequirementGroup[],
  validCodes: ReadonlySet<string>
): RequirementGroup[] {
  const out: RequirementGroup[] = []
  for (const g of groups) {
    const options = g.options.filter((c) => validCodes.has(c))
    if (options.length === 0) continue
    out.push({
      grouping: g.grouping,
      options,
      required: Math.min(options.length, g.required),
    })
  }
  return out
}

function groupsFromFlat(
  units: ReadonlyArray<{ code: string; grouping: string }>
): RequirementGroup[] {
  const m = new Map<string, string[]>()
  for (const u of units) {
    const list = m.get(u.grouping) ?? []
    if (!list.includes(u.code)) list.push(u.code)
    m.set(u.grouping, list)
  }
  return [...m.entries()].map(([grouping, options]) => ({
    grouping,
    options,
    required: options.length,
  }))
}

function kindOrder(k: PlannerAreaOfStudy["kind"]): number {
  switch (k) {
    case "major":
      return 0
    case "extended_major":
      return 1
    case "specialisation":
      return 2
    case "minor":
      return 3
    case "elective":
      return 4
    case "other":
      return 5
  }
}

/**
 * Fetch full unit records for the given codes. Missing codes are
 * silently dropped — the caller can diff against the input list.
 */
export async function fetchUnitsByCode(
  codes: readonly string[],
  year: string = HANDBOOK_YEAR
): Promise<PlannerUnit[]> {
  if (codes.length === 0) return []
  const db = getDb()
  const rows = await db
    .select({
      year: units.year,
      code: units.code,
      title: units.title,
      creditPoints: units.creditPoints,
      level: units.level,
      synopsis: units.handbookSynopsis,
      school: units.school,
    })
    .from(units)
    .where(and(eq(units.year, year), inArray(units.code, [...codes])))

  return rows.map((r) => ({
    year: r.year,
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    level: r.level,
    synopsis: r.synopsis,
    school: r.school,
  }))
}

export async function searchUnits(
  query: string,
  limit = 25,
  year: string = HANDBOOK_YEAR
): Promise<PlannerUnit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const db = getDb()
  const q = `%${trimmed}%`
  const rows = await db
    .select({
      year: units.year,
      code: units.code,
      title: units.title,
      creditPoints: units.creditPoints,
      level: units.level,
      synopsis: units.handbookSynopsis,
      school: units.school,
    })
    .from(units)
    .where(
      and(eq(units.year, year), or(ilike(units.code, q), ilike(units.title, q)))
    )
    .orderBy(units.code)
    .limit(limit)

  return rows.map((r) => ({
    year: r.year,
    code: r.code,
    title: r.title,
    creditPoints: r.creditPoints ?? 0,
    level: r.level,
    synopsis: r.synopsis,
    school: r.school,
  }))
}

export async function fetchOfferingsForCodes(
  codes: readonly string[],
  year: string = HANDBOOK_YEAR
): Promise<Map<string, PlannerOffering[]>> {
  const out = new Map<string, PlannerOffering[]>()
  if (codes.length === 0) return out

  const db = getDb()
  const rows = await db
    .select({
      unitCode: unitOfferings.unitCode,
      teachingPeriod: unitOfferings.teachingPeriod,
      location: unitOfferings.location,
      attendanceModeCode: unitOfferings.attendanceModeCode,
    })
    .from(unitOfferings)
    .where(
      and(
        eq(unitOfferings.year, year),
        eq(unitOfferings.offered, true),
        inArray(unitOfferings.unitCode, [...codes])
      )
    )

  for (const r of rows) {
    const list = out.get(r.unitCode) ?? []
    list.push({
      unitCode: r.unitCode,
      teachingPeriod: r.teachingPeriod ?? "",
      location: r.location,
      attendanceModeCode: r.attendanceModeCode,
      periodKind: classifyTeachingPeriod(r.teachingPeriod),
    })
    out.set(r.unitCode, list)
  }
  return out
}

export async function fetchRequisitesForCodes(
  codes: readonly string[],
  year: string = HANDBOOK_YEAR
): Promise<Map<string, RequisiteBlock[]>> {
  const out = new Map<string, RequisiteBlock[]>()
  if (codes.length === 0) return out

  const db = getDb()
  const rows = await db
    .select({
      unitCode: requisites.unitCode,
      requisiteType: requisites.requisiteType,
      rule: requisites.rule,
    })
    .from(requisites)
    .where(
      and(eq(requisites.year, year), inArray(requisites.unitCode, [...codes]))
    )

  for (const r of rows) {
    const list = out.get(r.unitCode) ?? []
    list.push({
      requisiteType: r.requisiteType,
      rule: (r.rule as RequisiteRule | null) ?? null,
    })
    out.set(r.unitCode, list)
  }
  return out
}

export async function fetchEnrolmentRulesForCodes(
  codes: readonly string[],
  year: string = HANDBOOK_YEAR
): Promise<
  Map<string, { ruleType: string | null; description: string | null }[]>
> {
  const out = new Map<
    string,
    { ruleType: string | null; description: string | null }[]
  >()
  if (codes.length === 0) return out

  const db = getDb()
  const rows = await db
    .select({
      unitCode: enrolmentRules.unitCode,
      ruleType: enrolmentRules.ruleType,
      description: enrolmentRules.description,
    })
    .from(enrolmentRules)
    .where(
      and(
        eq(enrolmentRules.year, year),
        inArray(enrolmentRules.unitCode, [...codes])
      )
    )

  for (const r of rows) {
    const list = out.get(r.unitCode) ?? []
    list.push({ ruleType: r.ruleType, description: r.description })
    out.set(r.unitCode, list)
  }
  return out
}

/**
 * Hydrate every piece of per-unit data the planner needs for a given
 * set of codes. Single round-trip from the UI's perspective (three
 * parallel DB queries internally).
 */
export async function hydratePlannerUnits(
  codes: readonly string[],
  year: string = HANDBOOK_YEAR
): Promise<{
  units: Map<string, PlannerUnit>
  offerings: Map<string, PlannerOffering[]>
  requisites: Map<string, RequisiteBlock[]>
}> {
  const [unitList, offerings, reqs] = await Promise.all([
    fetchUnitsByCode(codes, year),
    fetchOfferingsForCodes(codes, year),
    fetchRequisitesForCodes(codes, year),
  ])
  const unitsByCode = new Map(unitList.map((u) => [u.code, u]))
  return { units: unitsByCode, offerings, requisites: reqs }
}
