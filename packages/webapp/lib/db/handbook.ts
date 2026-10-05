/**
 * Queries for the public handbook pages: /search, /units/[code],
 * /courses/[code], /aos/[code] and the sitemap.
 *
 * Every page query is memoised per process (cacheHandbook), and the
 * pages themselves are cached as ISR HTML, so a page costs its queries
 * once per week per server rather than once per visit.
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
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm"

import { getDb } from "./client.ts"
import { cacheHandbook } from "./memo.ts"
import {
  fetchCourseWithAoS,
  fetchEnrolmentRulesForCodes,
  fetchEquivalentsForCodes,
  fetchRequisitesForCodes,
} from "./queries.ts"
import {
  buildCurriculumTree,
  curriculumUnitCodes,
  type CurriculumNode,
} from "../handbook/curriculum-tree.ts"
import type { EntityKind } from "../handbook/links.ts"
import type { SearchTab, StudyLevel } from "../handbook/search-url.ts"
import * as raw from "../handbook/raw.ts"
import { classifyTeachingPeriod } from "../planner/teaching-period.ts"
import type {
  PeriodKind,
  PlannerAreaOfStudy,
  RequisiteBlock,
  RequisiteRule,
} from "../planner/types.ts"

type Row = Record<string, unknown>

async function rows<T = Row>(query: SQL): Promise<T[]> {
  return (await getDb().execute(query)) as unknown as T[]
}

const TABLE: Record<EntityKind, SQL> = {
  unit: sql`units`,
  course: sql`courses`,
  aos: sql`areas_of_study`,
}

/* ------------------------------------------------------------------ *
 * Years and codes
 * ------------------------------------------------------------------ */

async function _listEntityYears(
  kind: EntityKind,
  code: string
): Promise<string[]> {
  const r = await rows<{ year: string }>(
    sql`SELECT year FROM ${TABLE[kind]} WHERE code = ${code} ORDER BY year`
  )
  return r.map((x) => x.year)
}
/** The handbook years that have a page for this entity, oldest first. */
export const listEntityYears = cacheHandbook(_listEntityYears)

/** Which of `codes` have a page in any handbook year. */
async function _filterExistingUnits(
  codes: readonly string[]
): Promise<string[]> {
  if (codes.length === 0) return []
  const r = await getDb()
    .selectDistinct({ code: units.code })
    .from(units)
    .where(inArray(units.code, [...codes]))
  return r.map((x) => x.code)
}
const filterExistingUnits = cacheHandbook(_filterExistingUnits)

async function _unitTitles(
  codes: readonly string[],
  year: string
): Promise<Record<string, string>> {
  if (codes.length === 0) return {}
  // The page year's title, else the latest title the code ever had.
  const r = await rows<{ code: string; title: string }>(sql`
    SELECT DISTINCT ON (code) code, title FROM units
    WHERE code IN (${sql.join(
      codes.map((c) => sql`${c}`),
      sql`, `
    )})
    ORDER BY code, (year = ${year}) DESC, year DESC
  `)
  return Object.fromEntries(r.map((x) => [x.code, x.title]))
}
const unitTitles = cacheHandbook(_unitTitles)

/* ------------------------------------------------------------------ *
 * Unit page
 * ------------------------------------------------------------------ */

export interface UnitPageOffering {
  teachingPeriod: string
  periodKind: PeriodKind
  location: string | null
  attendanceMode: string | null
  attendanceModeCode: string | null
}

export interface UnitPageData {
  year: string
  years: string[]
  code: string
  title: string
  creditPoints: number
  level: string | null
  type: string | null
  status: string | null
  undergradPostgrad: string | null
  school: string | null
  academicOrg: string | null
  synopsis: string | null
  offerings: UnitPageOffering[]
  requisites: RequisiteBlock[]
  enrolmentRules: string[]
  /** Units that list this one as a prerequisite or corequisite. */
  unlocks: Array<{ code: string; type: string }>
  equivalents: string[]
  areasOfStudy: Array<{ code: string; title: string; grouping: string }>
  /** Titles for every unit code the page mentions. */
  titles: Record<string, string>
  /** The mentioned unit codes that have a MonMap page (any year). */
  linkable: string[]
  assessments: raw.Assessment[]
  assessmentNote: string | null
  learningOutcomes: raw.LearningOutcome[]
  workload: string | null
  activities: raw.LearningActivity[]
  resources: raw.ResourceGroup[]
  teachingApproaches: raw.TeachingApproach[]
  contacts: raw.ContactRole[]
  workIntegratedLearning: string[]
  scaBand: string | null
  eftsl: string | null
  studyAbroad: boolean
}

function ruleCodes(rule: RequisiteRule | null): string[] {
  const out: string[] = []
  const walk = (containers: RequisiteRule | undefined) => {
    for (const c of containers ?? []) {
      for (const l of c.relationships ?? []) out.push(l.academic_item_code)
      walk(c.containers)
    }
  }
  walk(rule ?? undefined)
  return out
}

async function _fetchUnitPage(
  code: string,
  year: string
): Promise<UnitPageData | null> {
  const db = getDb()
  const [unit] = await db
    .select()
    .from(units)
    .where(and(eq(units.year, year), eq(units.code, code)))
    .limit(1)
  if (!unit) return null
  const r = unit.raw as Record<string, unknown>

  const [
    years,
    offeringRows,
    requisiteMap,
    enrolmentMap,
    reverseRefs,
    equivalentMap,
    aosRows,
  ] = await Promise.all([
    listEntityYears("unit", code),
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
    fetchRequisitesForCodes([code], year),
    fetchEnrolmentRulesForCodes([code], year),
    db
      .selectDistinct({
        code: requisiteRefs.unitCode,
        type: requisiteRefs.requisiteType,
      })
      .from(requisiteRefs)
      .where(
        and(
          eq(requisiteRefs.year, year),
          eq(requisiteRefs.requiresUnitCode, code),
          inArray(requisiteRefs.requisiteType, ["prerequisite", "corequisite"])
        )
      )
      .orderBy(asc(requisiteRefs.unitCode)),
    fetchEquivalentsForCodes([code], year),
    db
      .selectDistinct({
        code: areaOfStudyUnits.aosCode,
        title: areasOfStudy.title,
        grouping: areaOfStudyUnits.grouping,
      })
      .from(areaOfStudyUnits)
      .innerJoin(
        areasOfStudy,
        and(
          eq(areaOfStudyUnits.aosYear, areasOfStudy.year),
          eq(areaOfStudyUnits.aosCode, areasOfStudy.code)
        )
      )
      .where(
        and(
          eq(areaOfStudyUnits.unitCode, code),
          eq(areaOfStudyUnits.aosYear, year)
        )
      )
      .orderBy(asc(areasOfStudy.title)),
  ])

  const requisites = (requisiteMap.get(code) ?? []).filter(
    (b) => b.rule && b.rule.length > 0
  )
  const unlockSeen = new Set<string>()
  const unlocks = reverseRefs.filter((x) => {
    if (x.code === code || unlockSeen.has(x.code)) return false
    unlockSeen.add(x.code)
    return true
  })
  const equivalents = equivalentMap.get(code) ?? []
  const aosSeen = new Set<string>()
  const areas = aosRows.filter((a) => {
    if (aosSeen.has(a.code)) return false
    aosSeen.add(a.code)
    return true
  })

  const mentioned = [
    ...new Set([
      ...requisites.flatMap((b) => ruleCodes(b.rule)),
      ...unlocks.map((u) => u.code),
      ...equivalents,
    ]),
  ]
  const [titles, linkable] = await Promise.all([
    unitTitles([...mentioned].sort(), year),
    filterExistingUnits([...mentioned].sort()),
  ])

  return {
    year,
    years,
    code: unit.code,
    title: unit.title,
    creditPoints: unit.creditPoints ?? 0,
    level: unit.level,
    type: unit.type,
    status: unit.status,
    undergradPostgrad: unit.undergradPostgrad,
    school: unit.school,
    academicOrg: unit.academicOrg,
    synopsis: raw.html(unit.handbookSynopsis),
    offerings: offeringRows
      .map((o) => ({
        ...o,
        teachingPeriod: o.teachingPeriod ?? "Teaching period to be confirmed",
        periodKind: classifyTeachingPeriod(o.teachingPeriod),
      }))
      .sort(
        (a, b) =>
          PERIOD_ORDER.indexOf(a.periodKind) -
            PERIOD_ORDER.indexOf(b.periodKind) ||
          a.teachingPeriod.localeCompare(b.teachingPeriod) ||
          (a.location ?? "").localeCompare(b.location ?? "")
      ),
    requisites,
    enrolmentRules: (enrolmentMap.get(code) ?? []).flatMap(
      (e) => raw.html(e.description) ?? []
    ),
    unlocks,
    equivalents,
    areasOfStudy: areas,
    titles,
    linkable,
    assessments: raw.assessments(r.assessments),
    assessmentNote: raw.text(r.assessment_static_text),
    learningOutcomes: raw.learningOutcomes(r.unit_learning_outcomes),
    workload: raw.html(r.workload_requirements),
    activities: raw.learningActivities(r.learning_activities_grouped),
    resources: raw.learningResources(r.learning_resources_grouped),
    teachingApproaches: raw.teachingApproaches(r.teaching_approaches),
    contacts: raw.contactRoles(r.academic_contact_roles),
    workIntegratedLearning: raw.labels(r.work_integrated_learning),
    scaBand: raw.text(r.highest_sca_band),
    eftsl: raw.text(r.eftsl),
    studyAbroad: raw.text(r.study_abroad_unit)?.toLowerCase() === "yes",
  }
}
export const fetchUnitPage = cacheHandbook(_fetchUnitPage)

const PERIOD_ORDER: PeriodKind[] = [
  "SUMMER_A",
  "S1",
  "WINTER",
  "S2",
  "SUMMER_B",
  "FULL_YEAR",
  "OTHER",
]

/* ------------------------------------------------------------------ *
 * Course page
 * ------------------------------------------------------------------ */

export interface CoursePageData {
  year: string
  years: string[]
  code: string
  title: string
  abbreviatedName: string | null
  creditPoints: number
  aqfLevel: string | null
  type: string | null
  school: string | null
  cricosCode: string | null
  overview: string | null
  curriculum: CurriculumNode[]
  requirements: string | null
  structure: string | null
  learningOutcomes: raw.LearningOutcome[]
  outcomesIntro: string | null
  /** Areas of study with a real page; virtual specialisations are left out. */
  areasOfStudy: PlannerAreaOfStudy[]
  components: Array<{ code: string; title: string; componentTitle: string }>
  fullTime: string | null
  partTime: string | null
  maximumYears: string | null
  modes: raw.CourseMode[]
  locations: string | null
  atar: string | null
  entry: string | null
  englishLanguage: string | null
  nonYear12Entry: string | null
  progression: string | null
  accreditation: string | null
  specialNotes: string | null
  otherInformation: string | null
  awards: string[]
  contacts: raw.ContactRole[]
  /** Unit codes in the structure that have a MonMap page. */
  linkableUnits: string[]
}

async function _fetchCoursePage(
  code: string,
  year: string
): Promise<CoursePageData | null> {
  const db = getDb()
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.year, year), eq(courses.code, code)))
    .limit(1)
  if (!course) return null
  const r = course.raw as Record<string, unknown>
  const curriculum = buildCurriculumTree(course.curriculumStructure)

  const [years, withAos, linkableUnits] = await Promise.all([
    listEntityYears("course", code),
    fetchCourseWithAoS(code, year),
    filterExistingUnits(curriculumUnitCodes(curriculum).sort()),
  ])

  return {
    year,
    years,
    code: course.code,
    title: course.title,
    abbreviatedName: course.abbreviatedName,
    creditPoints: course.creditPoints ?? 0,
    aqfLevel: course.aqfLevel,
    type: course.type,
    school: course.school,
    cricosCode: course.cricosCode,
    overview: raw.html(course.overview),
    curriculum,
    requirements: raw.html(r.requirements),
    structure: raw.html(r.structure),
    learningOutcomes: raw.learningOutcomes(r.learning_outcomes),
    outcomesIntro: raw.html(r.learning_outcome_static_text),
    areasOfStudy: (withAos?.areasOfStudy ?? []).filter(
      (a) => !a.code.includes(":")
    ),
    components: (withAos?.componentCourses ?? []).map((c) => ({
      code: c.courseCode,
      title: c.courseTitle,
      componentTitle: c.componentTitle.trim(),
    })),
    fullTime: raw.duration(r.full_time_duration),
    partTime: raw.duration(r.part_time_duration),
    maximumYears: raw.text(r.maximum_duration),
    modes: raw.courseModes(r.modes),
    locations: raw.text(r.location),
    atar: raw.text(r.atar),
    entry: raw.html(r.entry),
    englishLanguage: raw.html(r.english_language),
    nonYear12Entry: raw.html(r.non_year_12_entry),
    progression: raw.html(r.progression),
    accreditation: raw.html(r.professional_accreditation),
    specialNotes: raw.html(r.Special_notes_to_students),
    otherInformation: raw.html(r.other_information),
    awards: raw.awardTitles(r.award_titles),
    contacts: raw.contactRoles(r.academic_contact_roles),
    linkableUnits,
  }
}
export const fetchCoursePage = cacheHandbook(_fetchCoursePage)

/* ------------------------------------------------------------------ *
 * Area of study page
 * ------------------------------------------------------------------ */

export interface AosPageData {
  year: string
  years: string[]
  code: string
  title: string
  creditPoints: number | null
  studyLevel: string | null
  school: string | null
  academicOrg: string | null
  /** How courses list it most often: "major", "minor", ... */
  kind: string | null
  description: string | null
  specialStatements: string | null
  learningOutcomes: raw.LearningOutcome[]
  outcomesIntro: string | null
  locations: string | null
  contacts: raw.ContactRole[]
  curriculum: CurriculumNode[]
  /** The units the area of study lists, for the graph. */
  unitCodes: string[]
  linkableUnits: string[]
  courses: Array<{
    code: string
    title: string
    year: string
    kind: string
    relationshipLabel: string
  }>
}

async function _fetchAosPage(
  code: string,
  year: string
): Promise<AosPageData | null> {
  const db = getDb()
  const [aos] = await db
    .select()
    .from(areasOfStudy)
    .where(and(eq(areasOfStudy.year, year), eq(areasOfStudy.code, code)))
    .limit(1)
  if (!aos) return null
  const r = aos.raw as Record<string, unknown>
  const curriculum = buildCurriculumTree(aos.curriculumStructure)

  const [years, unitRows, courseRows] = await Promise.all([
    listEntityYears("aos", code),
    db
      .selectDistinct({ code: areaOfStudyUnits.unitCode })
      .from(areaOfStudyUnits)
      .where(
        and(
          eq(areaOfStudyUnits.aosYear, year),
          eq(areaOfStudyUnits.aosCode, code)
        )
      ),
    // Courses of this year, plus later-year courses that link this
    // year's page because their own year has none yet (2027 S2000
    // offers the 2026 APPLMTH05).
    db
      .selectDistinct({
        code: courseAreasOfStudy.courseCode,
        year: courseAreasOfStudy.courseYear,
        kind: courseAreasOfStudy.kind,
        relationshipLabel: courseAreasOfStudy.relationshipLabel,
        title: courses.title,
      })
      .from(courseAreasOfStudy)
      .innerJoin(
        courses,
        and(
          eq(courseAreasOfStudy.courseYear, courses.year),
          eq(courseAreasOfStudy.courseCode, courses.code)
        )
      )
      .where(
        and(
          eq(courseAreasOfStudy.aosYear, year),
          eq(courseAreasOfStudy.aosCode, code)
        )
      )
      .orderBy(asc(courses.title)),
  ])

  const unitCodes = [
    ...new Set([
      ...unitRows.map((u) => u.code),
      ...curriculumUnitCodes(curriculum),
    ]),
  ].sort()
  const linkableUnits = await filterExistingUnits(unitCodes)

  // One row per course: the course's own year wins over a later year
  // that borrows this page.
  const byCourse = new Map<string, AosPageData["courses"][number]>()
  for (const c of courseRows) {
    const prev = byCourse.get(c.code)
    if (!prev || (prev.year !== year && c.year === year))
      byCourse.set(c.code, c)
  }
  const kinds = new Map<string, number>()
  for (const c of byCourse.values())
    kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1)
  const kind =
    [...kinds.entries()]
      .filter(([k]) => k !== "other" && k !== "elective")
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? kindFromCode(code)

  return {
    year,
    years,
    code: aos.code,
    title: aos.title,
    creditPoints: aos.creditPoints,
    studyLevel: aos.studyLevel,
    school: aos.school,
    academicOrg: aos.academicOrg,
    kind,
    description: raw.html(aos.handbookDescription),
    specialStatements: raw.html(r.special_statements),
    learningOutcomes: raw.learningOutcomes(r.learning_outcomes),
    outcomesIntro: raw.html(r.learning_outcome_static_text),
    locations: raw.text(r.aos_offering_locations),
    contacts: raw.contactList(r.academic_coordinator, "Academic coordinator"),
    curriculum,
    unitCodes,
    linkableUnits,
    courses: [...byCourse.values()],
  }
}
export const fetchAosPage = cacheHandbook(_fetchAosPage)

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export const SEARCH_PAGE_SIZE = 20

export interface SearchInput {
  q: string
  tab: SearchTab
  year: string
  faculty: string | null
  study: StudyLevel | null
  /** Unit filters; they hide courses and areas of study. */
  level: string | null
  period: PeriodKind | null
  campus: string | null
  page: number
}

export interface SearchHit {
  kind: EntityKind
  code: string
  title: string
  creditPoints: number | null
  school: string | null
  /** "Undergraduate", "Postgraduate", ... */
  studyLevel: string | null
  /** "Level 2", "Bachelor Degree", "Major", ... */
  detail: string | null
  /** Handbook prose as plain text, for a two-line preview. */
  snippet: string | null
  periods: PeriodKind[]
  campuses: string[]
}

export interface SearchResult {
  hits: SearchHit[]
  counts: Record<EntityKind, number>
  /** Results on the current tab. */
  total: number
  /** Set when the query is exactly one entity's code. */
  exact: { kind: EntityKind; code: string } | null
  /**
   * Set when the query is a code that this year lacks but another year
   * has: 2027 renumbered FIT2004, so a search for it in 2027 points to
   * the 2026 page.
   */
  elsewhere: { kind: EntityKind; code: string; year: string } | null
}

const PERIOD_PREFIX: Partial<Record<PeriodKind, string>> = {
  S1: "First semester%",
  S2: "Second semester%",
  SUMMER_A: "Summer semester A%",
  SUMMER_B: "Summer semester B%",
  WINTER: "Winter semester%",
  FULL_YEAR: "Full year%",
}

/** Course study level from its AQF level label, checked in this order. */
const COURSE_STUDY = sql`CASE
  WHEN c.aqf_level ~ 'Level [5-7]' THEN 'Undergraduate'
  WHEN c.aqf_level ~* 'Level 10|research' THEN 'Research'
  WHEN c.aqf_level ~* 'Level 9|graduate (certificate|diploma)' THEN 'Postgraduate'
  WHEN c.aqf_level ~* 'honours' THEN 'Honours'
END`

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&")
}

function tokens(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 0)
    ),
  ].slice(0, 8)
}

// Postgres's English stop-word list, minus words no search needs.
const STOP_WORDS = new Set(
  "a an and are as at be but by for from has have i in into is it its no not of on or such that the their then there these they this to was were will with you your".split(
    " "
  )
)

interface SearchCols {
  code: SQL
  title: SQL
  /** Another exact-match name, such as a course's "BCompSci". */
  alias: SQL | null
  /** The stored full-text vector (migration 0014). */
  vector: SQL
}

interface Ranking {
  /** Rows worth ranking. Every branch can use an index. */
  where: SQL
  rank: SQL
  /** Full-text rank, to order rows within a tier. */
  textRank: SQL
  /** Title closeness, to order rows within a tier. */
  sim: SQL
}

/**
 * How one table's rows match the query. Exact and prefix code matches
 * rank first; then title matches, from whole title to word prefix to
 * substring; then every word of the query in the title or code; then a
 * full-text match over title and handbook prose, which stems words
 * ("algorithm" finds "algorithms"); then a trigram match for typos.
 *
 * `where` keeps only rows one of those can match. The trigram GIN
 * indexes serve the ILIKE and `<%` branches and the search_vector GIN
 * index serves the full-text one, so a query reads only candidates
 * instead of ranking every row of the year.
 */
function ranking(q: string, c: SearchCols): Ranking {
  const query = q.trim()
  if (!query) {
    return { where: sql`TRUE`, rank: sql`1`, textRank: sql`0`, sim: sql`0` }
  }
  const lower = query.toLowerCase()
  const esc = likeEscape(lower)
  const words = tokens(query)
  const allWords =
    words.length === 0
      ? sql`FALSE`
      : sql.join(
          words.map((w) => {
            const p = `%${likeEscape(w)}%`
            return sql`(${c.title} ILIKE ${p} OR ${c.code} ILIKE ${p})`
          }),
          sql` AND `
        )
  // Every word as a prefix ("machine learn" finds "machine learning").
  // Words are [a-z0-9]+, so they are safe inside to_tsquery syntax.
  // Postgres drops English stop words from a tsquery and logs a notice
  // for each one, so they are left out here.
  const tsWords = words.filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  const tsq = tsWords.length
    ? sql`to_tsquery('english', ${tsWords.map((w) => `${w}:*`).join(" & ")})`
    : null
  const text = tsq ? sql`${c.vector} @@ ${tsq}` : sql`FALSE`
  const alias = c.alias ? sql`${c.alias} ILIKE ${esc}` : sql`FALSE`
  const fuzzy = sql`${lower} <% ${c.title}`

  return {
    where: sql`(
      ${c.code} ILIKE ${`${esc}%`}
      OR ${c.title} ILIKE ${`%${esc}%`}
      OR ${alias}
      OR (${allWords})
      OR ${text}
      OR ${fuzzy}
    )`,
    rank: sql`CASE
      WHEN upper(${c.code}) = ${query.toUpperCase()} THEN 1000
      WHEN ${c.code} ILIKE ${`${esc}%`} THEN 900
      WHEN lower(${c.title}) = ${lower} THEN 850
      WHEN ${alias} THEN 840
      WHEN ${c.title} ILIKE ${`${esc}%`} THEN 700
      WHEN (' ' || ${c.title}) ILIKE ${`% ${esc}%`} THEN 600
      WHEN ${c.title} ILIKE ${`%${esc}%`} THEN 500
      WHEN ${allWords} THEN 400
      WHEN ${text} THEN 300
      WHEN ${fuzzy} THEN 200
      ELSE 0
    END`,
    textRank: tsq ? sql`ts_rank_cd(${c.vector}, ${tsq})` : sql`0`,
    sim: sql`word_similarity(${lower}, ${c.title})`,
  }
}

const TAB_KIND: Record<SearchTab, EntityKind | null> = {
  all: null,
  courses: "course",
  aos: "aos",
  units: "unit",
}

function plainText(htmlText: string | null, max = 240): string | null {
  if (!htmlText) return null
  const t = htmlText
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
  if (!t) return null
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}...` : t
}

async function _searchHandbook(input: SearchInput): Promise<SearchResult> {
  const { q, year } = input
  const unitOnly =
    input.level != null || input.period != null || input.campus != null

  const courseWhere: SQL[] = [sql`c.year = ${year}`]
  const aosWhere: SQL[] = [sql`a.year = ${year}`]
  const unitWhere: SQL[] = [sql`u.year = ${year}`]
  if (input.faculty) {
    courseWhere.push(sql`c.school = ${input.faculty}`)
    aosWhere.push(sql`a.school = ${input.faculty}`)
    unitWhere.push(sql`u.school = ${input.faculty}`)
  }
  if (input.study) {
    courseWhere.push(sql`${COURSE_STUDY} = ${input.study}`)
    aosWhere.push(sql`a.study_level = ${input.study}`)
    if (input.study === "Undergraduate" || input.study === "Postgraduate") {
      unitWhere.push(
        sql`u.undergrad_postgrad IN (${input.study}, 'Undergraduate and Postgraduate')`
      )
    } else unitWhere.push(sql`FALSE`)
  }
  if (unitOnly) {
    courseWhere.push(sql`FALSE`)
    aosWhere.push(sql`FALSE`)
  }
  if (input.level) unitWhere.push(sql`u.level = ${`Level ${input.level}`}`)
  const periodPrefix = input.period ? PERIOD_PREFIX[input.period] : null
  if (input.period || input.campus) {
    const conds: SQL[] = [
      sql`o.year = u.year`,
      sql`o.unit_code = u.code`,
      sql`o.offered`,
    ]
    if (input.period) {
      conds.push(
        periodPrefix
          ? sql`o.teaching_period ILIKE ${periodPrefix}`
          : sql`NOT (${sql.join(
              Object.values(PERIOD_PREFIX).map(
                (p) => sql`coalesce(o.teaching_period, '') ILIKE ${p}`
              ),
              sql` OR `
            )})`
      )
    }
    if (input.campus) conds.push(sql`o.location = ${input.campus}`)
    unitWhere.push(
      sql`EXISTS (SELECT 1 FROM unit_offerings o WHERE ${sql.join(conds, sql` AND `)})`
    )
  }

  const where = (list: SQL[]) => sql.join(list, sql` AND `)
  const course = ranking(q, {
    code: sql`c.code`,
    title: sql`c.title`,
    alias: sql`c.abbreviated_name`,
    vector: sql`c.search_vector`,
  })
  const aos = ranking(q, {
    code: sql`a.code`,
    title: sql`a.title`,
    alias: null,
    vector: sql`a.search_vector`,
  })
  const unit = ranking(q, {
    code: sql`u.code`,
    title: sql`u.title`,
    alias: null,
    vector: sql`u.search_vector`,
  })
  const kind = TAB_KIND[input.tab]
  // With a query: relevance; then, among prose matches, the full-text
  // rank; then closeness to the title; then the shorter title
  // (C2001 "Bachelor of Computer Science" before the double degrees
  // that contain it). Without one: alphabetical, like a handbook index.
  const order = q.trim()
    ? sql`rank DESC, (CASE WHEN rank = 300 THEN text_rank ELSE 0 END) DESC,
        round(sim::numeric, 1) DESC, length(title), kind_order, code`
    : sql`title, kind_order, code`
  const offset = Math.max(0, input.page - 1) * SEARCH_PAGE_SIZE

  const [result] = await rows<{
    counts: Record<string, number> | null
    hits: Array<{ kind: EntityKind; code: string; title: string }> | null
    exact: { kind: EntityKind; code: string } | null
  }>(sql`
    WITH ranked AS (
      SELECT 'course' AS kind, 0 AS kind_order, c.code, c.title,
        ${course.rank} AS rank, ${course.textRank} AS text_rank, ${course.sim} AS sim
      FROM courses c WHERE ${where([...courseWhere, course.where])}
      UNION ALL
      SELECT 'aos', 1, a.code, a.title, ${aos.rank}, ${aos.textRank}, ${aos.sim}
      FROM areas_of_study a WHERE ${where([...aosWhere, aos.where])}
      UNION ALL
      SELECT 'unit', 2, u.code, u.title, ${unit.rank}, ${unit.textRank}, ${unit.sim}
      FROM units u WHERE ${where([...unitWhere, unit.where])}
    ),
    matched AS MATERIALIZED (SELECT * FROM ranked WHERE rank > 0),
    page AS (
      SELECT kind, code, title, rank, text_rank, sim, kind_order FROM matched
      WHERE ${kind ? sql`kind = ${kind}` : sql`TRUE`}
      ORDER BY ${order}
      LIMIT ${SEARCH_PAGE_SIZE} OFFSET ${offset}
    )
    SELECT
      (SELECT json_object_agg(kind, n) FROM (
        SELECT kind, count(*)::int AS n FROM matched GROUP BY kind
      ) k) AS counts,
      (SELECT json_agg(json_build_object('kind', kind, 'code', code, 'title', title)
        ORDER BY ${order}) FROM page) AS hits,
      (SELECT json_build_object('kind', kind, 'code', code) FROM matched
        WHERE rank = 1000 ORDER BY kind_order LIMIT 1) AS exact
  `)

  const counts: Record<EntityKind, number> = {
    course: result?.counts?.course ?? 0,
    aos: result?.counts?.aos ?? 0,
    unit: result?.counts?.unit ?? 0,
  }
  const base = result?.hits ?? []
  const exact = q.trim() ? (result?.exact ?? null) : null
  const looksLikeCode = /^[A-Za-z0-9-]{4,12}$/.test(q.trim()) && /\d/.test(q)
  const [hits, elsewhere] = await Promise.all([
    hydrateHits(base, year),
    !exact && looksLikeCode ? findCodeElsewhere(q.trim().toUpperCase()) : null,
  ])
  return {
    hits,
    counts,
    total: kind ? counts[kind] : counts.course + counts.aos + counts.unit,
    exact,
    elsewhere,
  }
}

async function findCodeElsewhere(
  code: string
): Promise<SearchResult["elsewhere"]> {
  const [hit] = await rows<{
    kind: EntityKind
    code: string
    year: string
  }>(sql`
    SELECT kind, code, year FROM (
      SELECT 'unit' AS kind, code, max(year) AS year FROM units WHERE code = ${code} GROUP BY code
      UNION ALL
      SELECT 'course', code, max(year) FROM courses WHERE code = ${code} GROUP BY code
      UNION ALL
      SELECT 'aos', code, max(year) FROM areas_of_study WHERE code = ${code} GROUP BY code
    ) x LIMIT 1
  `)
  return hit ?? null
}
export const searchHandbook = cacheHandbook(_searchHandbook)

async function hydrateHits(
  base: Array<{ kind: EntityKind; code: string; title: string }>,
  year: string
): Promise<SearchHit[]> {
  const codesOf = (k: EntityKind) =>
    base.filter((h) => h.kind === k).map((h) => h.code)
  const unitCodes = codesOf("unit")
  const courseCodes = codesOf("course")
  const aosCodes = codesOf("aos")
  const db = getDb()

  const [unitRows, offeringRows, courseRows, aosRows, aosKinds] =
    await Promise.all([
      unitCodes.length
        ? db
            .select({
              code: units.code,
              creditPoints: units.creditPoints,
              school: units.school,
              level: units.level,
              study: units.undergradPostgrad,
              prose: units.handbookSynopsis,
            })
            .from(units)
            .where(and(eq(units.year, year), inArray(units.code, unitCodes)))
        : [],
      unitCodes.length
        ? db
            .selectDistinct({
              code: unitOfferings.unitCode,
              period: unitOfferings.teachingPeriod,
              location: unitOfferings.location,
            })
            .from(unitOfferings)
            .where(
              and(
                eq(unitOfferings.year, year),
                inArray(unitOfferings.unitCode, unitCodes),
                eq(unitOfferings.offered, true)
              )
            )
        : [],
      courseCodes.length
        ? rows<{
            code: string
            credit_points: number | null
            school: string | null
            aqf_level: string | null
            study: string | null
            prose: string | null
          }>(sql`
            SELECT c.code, c.credit_points, c.school, c.aqf_level,
              ${COURSE_STUDY} AS study, c.overview AS prose
            FROM courses c
            WHERE c.year = ${year} AND c.code IN (${sql.join(
              courseCodes.map((c) => sql`${c}`),
              sql`, `
            )})
          `)
        : [],
      aosCodes.length
        ? db
            .select({
              code: areasOfStudy.code,
              creditPoints: areasOfStudy.creditPoints,
              school: areasOfStudy.school,
              study: areasOfStudy.studyLevel,
              prose: areasOfStudy.handbookDescription,
            })
            .from(areasOfStudy)
            .where(
              and(
                eq(areasOfStudy.year, year),
                inArray(areasOfStudy.code, aosCodes)
              )
            )
        : [],
      aosCodes.length
        ? db
            .select({
              code: courseAreasOfStudy.aosCode,
              kind: courseAreasOfStudy.kind,
              n: sql<number>`count(*)::int`,
            })
            .from(courseAreasOfStudy)
            .where(
              and(
                eq(courseAreasOfStudy.aosYear, year),
                inArray(courseAreasOfStudy.aosCode, aosCodes)
              )
            )
            .groupBy(courseAreasOfStudy.aosCode, courseAreasOfStudy.kind)
        : [],
    ])

  const unitBy = new Map(unitRows.map((u) => [u.code, u]))
  const courseBy = new Map(courseRows.map((c) => [c.code, c]))
  const aosBy = new Map(aosRows.map((a) => [a.code, a]))
  const periodsBy = new Map<string, Set<PeriodKind>>()
  const campusesBy = new Map<string, Set<string>>()
  for (const o of offeringRows) {
    const p = periodsBy.get(o.code) ?? new Set()
    p.add(classifyTeachingPeriod(o.period))
    periodsBy.set(o.code, p)
    if (o.location) {
      const c = campusesBy.get(o.code) ?? new Set()
      c.add(o.location)
      campusesBy.set(o.code, c)
    }
  }
  const aosKindBy = new Map<string, { kind: string; n: number }>()
  for (const k of aosKinds) {
    if (k.kind === "other" || k.kind === "elective") continue
    const prev = aosKindBy.get(k.code)
    if (!prev || k.n > prev.n) aosKindBy.set(k.code, k)
  }

  return base.map((h): SearchHit => {
    if (h.kind === "unit") {
      const u = unitBy.get(h.code)
      return {
        ...h,
        creditPoints: u?.creditPoints ?? null,
        school: u?.school ?? null,
        studyLevel: u?.study ?? null,
        detail: u?.level ?? null,
        snippet: plainText(u?.prose ?? null),
        periods: PERIOD_ORDER.filter((p) => periodsBy.get(h.code)?.has(p)),
        campuses: [...(campusesBy.get(h.code) ?? [])].sort(),
      }
    }
    if (h.kind === "course") {
      const c = courseBy.get(h.code)
      return {
        ...h,
        creditPoints: c?.credit_points ?? null,
        school: c?.school ?? null,
        studyLevel: c?.study ?? null,
        detail:
          c?.aqf_level?.split(" / ")[0]?.replace(/^Level \d+ - /, "") ?? null,
        snippet: plainText(c?.prose ?? null),
        periods: [],
        campuses: [],
      }
    }
    const a = aosBy.get(h.code)
    const kind = aosKindBy.get(h.code)?.kind ?? kindFromCode(h.code)
    return {
      ...h,
      creditPoints: a?.creditPoints ?? null,
      school: a?.school ?? null,
      studyLevel: a?.study ?? null,
      detail: kind ? AOS_KIND_LABEL[kind] : null,
      snippet: plainText(a?.prose ?? null),
      periods: [],
      campuses: [],
    }
  })
}

/**
 * The 2027 handbook names AoS codes by kind (DASC-MAJ, DASC-MIN,
 * ALSO-USPEC). Used only when no course link says the kind, such as a
 * minor that courses list under "Elective studies".
 */
export function kindFromCode(code: string): string | null {
  if (/-E(X)?MAJ$/i.test(code)) return "extended_major"
  if (/-MAJ$/i.test(code)) return "major"
  if (/-MIN$/i.test(code)) return "minor"
  if (/SPEC$/i.test(code)) return "specialisation"
  return null
}

export const AOS_KIND_LABEL: Record<string, string> = {
  major: "Major",
  extended_major: "Extended major",
  specialisation: "Specialisation",
  minor: "Minor",
  elective: "Elective",
  other: "Area of study",
}

export interface SearchFacets {
  faculties: string[]
  campuses: string[]
  levels: string[]
}

async function _listSearchFacets(year: string): Promise<SearchFacets> {
  const [faculties, campuses, levels] = await Promise.all([
    rows<{ school: string }>(sql`
      SELECT school FROM (
        SELECT school FROM units WHERE year = ${year}
        UNION ALL SELECT school FROM courses WHERE year = ${year}
      ) s
      WHERE school LIKE 'Faculty of %'
      GROUP BY school ORDER BY count(*) DESC
    `),
    rows<{ location: string }>(sql`
      SELECT location FROM unit_offerings
      WHERE year = ${year} AND offered AND location IS NOT NULL
      GROUP BY location HAVING count(*) >= 50
      ORDER BY count(*) DESC LIMIT 12
    `),
    rows<{ level: string }>(sql`
      SELECT DISTINCT substring(level from '\\d+') AS level FROM units
      WHERE year = ${year} AND level ~ '^Level [1-9]$'
      ORDER BY 1
    `),
  ])
  return {
    faculties: faculties.map((f) => f.school),
    campuses: campuses.map((c) => c.location),
    levels: levels.map((l) => l.level),
  }
}
export const listSearchFacets = cacheHandbook(_listSearchFacets)

/* ------------------------------------------------------------------ *
 * Sitemap
 * ------------------------------------------------------------------ */

export interface SitemapEntry {
  code: string
  /** When its newest published review changed, if it has any. */
  lastmod: string | null
}

async function _listSitemapCodes(kind: EntityKind): Promise<SitemapEntry[]> {
  // Only current codes: in one of the two newest handbooks. Retired
  // codes keep their pages but are noindex (see resolveEntity).
  const r = await rows<{ code: string; lastmod: string | null }>(sql`
    WITH latest AS (
      SELECT code, max(year)::int AS year FROM ${TABLE[kind]} GROUP BY code
    )
    SELECT l.code, max(r.updated_at) AS lastmod
    FROM latest l
    LEFT JOIN review r
      ON r.entity_kind = ${kind} AND r.entity_code = l.code
      AND r.status = 'published'
    WHERE l.year >= (SELECT max(year)::int FROM units) - 1
    GROUP BY l.code
    ORDER BY l.code
  `)
  return r.map((x) => ({
    code: x.code,
    lastmod: x.lastmod ? new Date(x.lastmod).toISOString() : null,
  }))
}
/** Every current code, with the date its reviews last changed. */
export const listSitemapCodes = cacheHandbook(_listSitemapCodes)

/* ------------------------------------------------------------------ *
 * Hub pages: /courses and /aos
 * ------------------------------------------------------------------ */

export interface HubEntry {
  code: string
  title: string
  year: string
  school: string | null
  /** Courses: the AQF level text. Areas of study: the kind. */
  group: string | null
  creditPoints: number | null
}

async function _listCurrentCourses(): Promise<HubEntry[]> {
  return rows<HubEntry>(sql`
    SELECT DISTINCT ON (code) code, title, year, school,
      aqf_level AS "group", credit_points AS "creditPoints"
    FROM courses
    WHERE year::int >= (SELECT max(year)::int FROM units) - 1
    ORDER BY code, year DESC
  `)
}
/** Every current course at its latest year. */
export const listCurrentCourses = cacheHandbook(_listCurrentCourses)

async function _listCurrentAos(): Promise<HubEntry[]> {
  const r = await rows<HubEntry>(sql`
    SELECT DISTINCT ON (a.code) a.code, a.title, a.year, a.school,
      (SELECT c.kind::text FROM course_areas_of_study c
        WHERE c.aos_code = a.code
        GROUP BY c.kind ORDER BY count(*) DESC LIMIT 1) AS "group",
      a.credit_points AS "creditPoints"
    FROM areas_of_study a
    WHERE a.year::int >= (SELECT max(year)::int FROM units) - 1
    ORDER BY a.code, a.year DESC
  `)
  return r.map((a) => ({ ...a, group: a.group ?? kindFromCode(a.code) }))
}
/** Every current area of study at its latest year, with its kind. */
export const listCurrentAos = cacheHandbook(_listCurrentAos)

/* ------------------------------------------------------------------ *
 * Home page lists
 * ------------------------------------------------------------------ */

async function _listPopularCourses(
  limit: number
): Promise<Array<{ code: string; title: string }>> {
  // The courses students plan most. Only the order leaves this query:
  // no counts and nothing about any plan or user.
  return rows<{ code: string; title: string }>(sql`
    WITH planned AS (
      SELECT state->>'courseCode' AS code, count(*) AS n
      FROM user_plan
      WHERE state->>'courseCode' IS NOT NULL
      GROUP BY 1
    )
    SELECT p.code, c.title
    FROM planned p
    JOIN LATERAL (
      SELECT title FROM courses WHERE code = p.code ORDER BY year DESC LIMIT 1
    ) c ON TRUE
    ORDER BY p.n DESC, p.code
    LIMIT ${limit}
  `)
}
export const listPopularCourses = cacheHandbook(_listPopularCourses)
