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
export type {
  PeriodKind,
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
  synopsis: string | null
  school: string | null
}

/** A single offering row as the planner needs it. */
export interface PlannerOffering {
  unitCode: string
  teachingPeriod: string
  location: string | null
  attendanceModeCode: string | null
  periodKind: PeriodKind
}

/** A requisite rule tree — authoritative AND/OR semantics. */
export type RequisiteRule = RequisiteContainer[]

export interface RequisiteContainer {
  title?: string
  parent_connector?: { value?: string; label?: string } | null
  containers?: RequisiteContainer[]
  relationships?: RequisiteLeaf[]
}

export interface RequisiteLeaf {
  academic_item_code: string
  academic_item_name?: string
  academic_item_credit_points?: string | number
  academic_item_url?: string
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
 * One row in a curriculum requirement tree: a grouping (e.g. "Core
 * units", "Level 3 elective units"), the full list of unit options
 * the handbook lists under it, and how many of those students must
 * complete. `required === options.length` for "all required" groups;
 * `required < options.length` for "pick X of Y" choice groups.
 */
export interface RequirementGroup {
  grouping: string
  required: number
  options: string[]
}

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
   * For double degrees, the top-level component title from the curriculum
   * tree (e.g. "Computer Science component", "Engineering component").
   * Present only when the AoS is nested at least 2 levels deep under a
   * named top-level section. Used to label per-degree specialisation pickers.
   */
  componentLabel?: string
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
  overview: string | null
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
}

export const DEFAULT_SLOT_CAPACITY = 4
export const MAX_SLOT_CAPACITY = 8
export const STANDARD_CP = 6

export function slotCapacity(slot: PlannerSlot): number {
  return slot.capacity ?? DEFAULT_SLOT_CAPACITY
}

/**
 * Credit-weighted slots used in a slot. A 12 CP unit counts as 2,
 * an 18 CP unit as 3, a 24 CP unit as 4 — treating 6 CP as the baseline 1.
 * Unknown units (not yet loaded) default to 1.
 *
 * When `offerings` is supplied, full-year units in S1/S2 contribute
 * their half-year CP rather than the full unit CP — a 12 CP FY twin
 * weighs 1, not 2, in each semester it sits in. Passing offerings is
 * the right thing to do everywhere the FY twins are visible; the
 * optional shape keeps drop-target checks that don't yet know FY
 * status backwards-compatible (they overestimate, which is the safe
 * direction for capacity).
 */
export function slotUsedWeight(
  slot: PlannerSlot,
  units: ReadonlyMap<string, { creditPoints: number }>,
  offerings?: ReadonlyMap<string, PlannerOffering[]>
): number {
  return slot.unitCodes.reduce((sum, code) => {
    const fullCp = units.get(code)?.creditPoints ?? STANDARD_CP
    const cp =
      offerings && isFullYearTwinSlot(code, slot.kind, offerings)
        ? fullCp / 2
        : fullCp
    return sum + Math.max(1, Math.round(cp / STANDARD_CP))
  }, 0)
}

/**
 * Local FY-twin check used to keep slotUsedWeight free of a cycle
 * back into full-year.ts. Equivalent to `isFullYearUnit && slot is
 * S1/S2`; collapsed inline so the import graph stays one-way (the
 * planner helpers in full-year.ts and friends depend on these types,
 * not the other way around).
 */
function isFullYearTwinSlot(
  code: string,
  slotKind: PeriodKind,
  offerings: ReadonlyMap<string, PlannerOffering[]>
): boolean {
  if (slotKind !== "S1" && slotKind !== "S2") return false
  const list = offerings.get(code)
  if (!list || list.length === 0) return false
  let hasFullYear = false
  for (const o of list) {
    if (o.periodKind === "S1" || o.periodKind === "S2") return false
    if (o.periodKind === "FULL_YEAR") hasFullYear = true
  }
  return hasFullYear
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
