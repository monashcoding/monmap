/**
 * Domain types for the MonPlan-style planner.
 *
 * Deliberately narrow — these are the shapes the UI and pure logic
 * traffic in. Full handbook types live in `@monmap/scraper/types`
 * and `@monmap/db`; we only pull across what the planner actually
 * needs, and in the shape it needs them.
 *
 * Persisted types (PlannerState, PlannerYear, PlannerSlot, PeriodKind)
 * live in `@monmap/db` so Drizzle can `$type<PlannerState>()` the
 * jsonb column. We re-export them here so existing imports continue
 * to point at `@/lib/planner/types`.
 */
import type { PeriodKind, PlannerSlot } from "@monmap/db"
import type { RequirementGroup } from "@monmap/db/curriculum"
export type {
  PeriodKind,
  PlannerCreditEntry,
  PlannerSlot,
  PlannerState,
  PlannerYear,
} from "@monmap/db"

/** A unit as rendered by the planner. All references are by year+code. */
export interface PlannerUnit {
  year: string
  code: string
  title: string
  creditPoints: number
  level: string | null
  school: string | null
  /**
   * Codes this unit is equivalent to — same content under a different
   * code (advanced twins like FIT1045/FIT1053, faculty cross-listings,
   * campus variants). Derived from a mutual prohibition + matching title
   * (see fetchEquivalentsForCodes). Completing this unit satisfies a
   * prerequisite that names any of these. Only populated by the planner
   * hydration path; absent elsewhere.
   */
  equivalents?: string[]
  /**
   * Set when this unit was requested for a handbook year that has no
   * page for it and that year's curriculum trees link it to an earlier
   * year's page (2027 E3001 → `/2026/units/ENG1005`). Holds the
   * requested year; `year` is the year the data actually came from, so
   * offerings and requisites are that year's. See `unit_year_links`.
   */
  fallbackFor?: string
}

/** A single offering row as the planner needs it. */
export interface PlannerOffering {
  unitCode: string
  teachingPeriod: string
  location: string | null
  attendanceModeCode: string | null
  periodKind: PeriodKind
}

/**
 * A requisite rule tree — authoritative AND/OR semantics. Rules from the
 * database are slimmed to these fields (lib/db/requisite-rule.ts); the
 * raw CourseLoop JSON carries many more, which nothing reads.
 */
export type RequisiteRule = RequisiteContainer[]

export interface RequisiteContainer {
  /** CourseLoop placeholder ("Container 1"); dropped by the slimming. */
  title?: string
  /** Only `value` is read; `label` is dropped by the slimming. */
  parent_connector?: { value?: string; label?: string } | null
  containers?: RequisiteContainer[]
  relationships?: RequisiteLeaf[]
}

export interface RequisiteLeaf {
  academic_item_code: string
  academic_item_name?: string
}

export interface RequisiteBlock {
  requisiteType:
    | "prerequisite"
    | "corequisite"
    | "prohibition"
    | "permission"
    | "other"
  /** May be null — unit has an enrolment rule prose block but no structured tree. */
  rule: RequisiteRule | null
}

/**
 * One enrolment rule: handbook HTML prose (course-locked, permission,
 * credit-point gates), sanitized on the server. See
 * docs/handbook-internals.md for how it differs from a requisite.
 */
export interface EnrolmentRule {
  ruleType: string | null
  description: string | null
}

/**
 * A unit's handbook prose, which list payloads leave out and the
 * detail views load for the one unit they show.
 */
export interface UnitText {
  synopsis: string | null
  enrolmentRules: EnrolmentRule[]
}

/**
 * One row in a curriculum requirement tree: a grouping, its unit
 * options and how many must be completed. Defined once, by the
 * extractor in `@monmap/db`; the type-only re-export is erased, so it
 * adds nothing to client bundles.
 */
export type { DegreeShape, RequirementGroup } from "@monmap/db/curriculum"

/** An area of study on a course, as the picker surfaces it. */
export interface PlannerAreaOfStudy {
  code: string
  title: string
  kind:
    | "major"
    | "extended_major"
    | "minor"
    | "specialisation"
    | "elective"
    | "other"
  relationshipLabel: string
  /**
   * Campus this option is offered at, when the handbook scopes it —
   * E3001 splits its 22 engineering minors into "Malaysia offerings"
   * and "Clayton offerings", and until this was surfaced a Clayton
   * student saw nine Malaysia-only minors in the picker with nothing
   * to distinguish them. Null/absent means offered regardless of
   * campus.
   */
  scope?: string | null
  /**
   * For double degrees, the top-level component title from the curriculum
   * tree (e.g. "Computer Science component", "Engineering component").
   * Present only when the AoS is nested at least 2 levels deep under a
   * named top-level section. Used to label per-degree specialisation pickers.
   */
  componentLabel?: string
  /**
   * For double degrees, the course code of the component degree this AoS
   * belongs to (e.g. "C2001" for a CS specialisation inside S2004). The
   * structural join key to `PlannerCourseComponent.courseCode` — prefer
   * it over comparing `componentLabel` display strings, which differ in
   * case and trailing whitespace between the curriculum tree and the
   * sub-course refs.
   */
  componentCourseCode?: string
  creditPoints: number | null
  /**
   * Every unit listed by the AoS, regardless of whether it's required
   * or just one of several electives. Sourced from area_of_study_units.
   * Used by the Templates panel so students can browse all options.
   */
  units: { code: string; grouping: string }[]
  /**
   * Default units to auto-load when the user clicks "Load template" —
   * mandatory groupings in full plus the first `required` options of
   * any choice grouping.
   */
  requiredUnits: { code: string; grouping: string }[]
  /**
   * Per-grouping requirement structure. Drives the Requirements panel:
   * shows every option as a chip, but only counts up to `required`
   * matches per group toward the progress total.
   */
  requirements: RequirementGroup[]
}

/** A course as the picker surfaces it. */
export interface PlannerCourse {
  year: string
  code: string
  title: string
  creditPoints: number
  aqfLevel: string | null
  type: string | null
  /**
   * False when the handbook publishes no structure for the course in
   * this year: no requirement groups, areas of study or component
   * degrees (Monash College diplomas, or a new degree still being
   * written). Absent on older payloads; treat absent as true.
   */
  hasStructure?: boolean
  /**
   * For a course without a structure, the latest earlier year in which
   * the same code has one, if any, so the planner can point to it.
   */
  structureYear?: string | null
}

/** Core units for one degree inside a double degree. */
export interface PlannerCourseComponent {
  /** E.g. "Computer Science component" */
  componentTitle: string
  /** E.g. "C2001" */
  courseCode: string
  /** E.g. "Bachelor of Computer Science" */
  courseTitle: string
  courseUnits: { code: string; grouping: string }[]
  courseRequirements: RequirementGroup[]
  /**
   * True when the component course has no extractable course-level
   * template (all its units come via AoS/specialisation selection —
   * e.g. D3001 Education). The card must still render so half the
   * degree never silently vanishes.
   */
  missingTemplate?: boolean
}

/** A course with its attached areas of study, used once a course is selected. */
export interface PlannerCourseWithAoS extends PlannerCourse {
  areasOfStudy: PlannerAreaOfStudy[]
  /**
   * Default course-level units to auto-load (mandatory cores + first
   * `required` of each choice group). Same flat shape as AoS units so
   * UI code can render them identically.
   */
  courseUnits: { code: string; grouping: string }[]
  /**
   * Per-grouping structure for the course-level (degree) requirements
   * — drives the Requirements panel's Course block.
   */
  courseRequirements: RequirementGroup[]
  /**
   * For double degrees: one entry per component degree (e.g. BCompSci +
   * BEng). Empty for single degrees. When non-empty, templates show one
   * card per component instead of the single course card.
   */
  componentCourses: PlannerCourseComponent[]
  /**
   * Prohibition edges among this course's own option units, symmetrised
   * (Monash records about half of them one-directionally). Lets the
   * requirements view tell which options a student has locked
   * themselves out of: in L3005 the law half makes LAW2102 compulsory,
   * and BTC1110 prohibits it, so the commerce "6 of these 7" group was
   * never satisfiable and the degree could not reach 100%.
   *
   * Absent on payloads from before this shipped — treat as empty.
   */
  conflicts?: Record<string, string[]>
}

/**
 * Every unit code a course can put on the planner: its areas of study,
 * its own template and, for double degrees, each component's template.
 * The server prewarm and every client course load hydrate this list.
 */
export function plannerUnitCodes(
  course: Pick<
    PlannerCourseWithAoS,
    "areasOfStudy" | "courseUnits" | "componentCourses"
  >
): string[] {
  return [
    ...new Set([
      ...course.areasOfStudy.flatMap((a) => a.units.map((u) => u.code)),
      ...course.courseUnits.map((u) => u.code),
      ...course.componentCourses.flatMap((cc) =>
        cc.courseUnits.map((u) => u.code)
      ),
    ]),
  ]
}

export const DEFAULT_SLOT_CAPACITY = 4
export const MAX_SLOT_CAPACITY = 8
export const STANDARD_CP = 6

export function slotCapacity(slot: PlannerSlot): number {
  return slot.capacity ?? DEFAULT_SLOT_CAPACITY
}

/** Output of validating a single slot/unit pairing. */
export interface SlotUnitValidation {
  code: string
  /** Hard errors — render unit red, block count toward progress. */
  errors: ValidationIssue[]
  /** Soft — render unit amber/yellow. */
  warnings: ValidationIssue[]
}

export type ValidationIssueKind =
  | "not_offered_in_period"
  | "prereq_unmet"
  | "coreq_unmet"
  | "prohibition_conflict"
  | "over_credit_load"
  | "unknown_unit"

export interface ValidationIssue {
  kind: ValidationIssueKind
  message: string
  /** For prereq/coreq/prohibition issues, the codes that would satisfy it. */
  relatedCodes?: string[]
}
