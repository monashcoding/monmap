/**
 * Domain types for the MonPlan-style planner.
 *
 * Deliberately narrow — these are the shapes the UI and pure logic
 * traffic in. Full handbook types live in `@monmap/scraper/types`
 * and `@monmap/db`; we only pull across what the planner actually
 * needs, and in the shape it needs them.
 */

/** A unit as rendered by the planner. All references are by year+code. */
export interface PlannerUnit {
  year: string;
  code: string;
  title: string;
  creditPoints: number;
  level: string | null;
  synopsis: string | null;
  school: string | null;
}

/** Canonical teaching-period classification we use for slots + validation. */
export type PeriodKind =
  | "S1"
  | "S2"
  | "SUMMER_A"
  | "SUMMER_B"
  | "WINTER"
  | "FULL_YEAR"
  | "OTHER";

/** A single offering row as the planner needs it. */
export interface PlannerOffering {
  unitCode: string;
  teachingPeriod: string;
  location: string | null;
  attendanceModeCode: string | null;
  periodKind: PeriodKind;
}

/** A requisite rule tree — authoritative AND/OR semantics. */
export type RequisiteRule = RequisiteContainer[];

export interface RequisiteContainer {
  title?: string;
  parent_connector?: { value?: string; label?: string } | null;
  containers?: RequisiteContainer[];
  relationships?: RequisiteLeaf[];
}

export interface RequisiteLeaf {
  academic_item_code: string;
  academic_item_name?: string;
  academic_item_credit_points?: string | number;
  academic_item_url?: string;
}

export interface RequisiteBlock {
  requisiteType: "prerequisite" | "corequisite" | "prohibition" | "permission" | "other";
  /** May be null — unit has an enrolment rule prose block but no structured tree. */
  rule: RequisiteRule | null;
}

/** An area of study on a course, as the picker surfaces it. */
export interface PlannerAreaOfStudy {
  code: string;
  title: string;
  kind: "major" | "extended_major" | "minor" | "specialisation" | "elective" | "other";
  relationshipLabel: string;
  creditPoints: number | null;
  /** Direct unit codes attached to this AoS via area_of_study_units. */
  units: { code: string; grouping: string }[];
}

/** A course as the picker surfaces it. */
export interface PlannerCourse {
  year: string;
  code: string;
  title: string;
  creditPoints: number;
  aqfLevel: string | null;
  type: string | null;
  overview: string | null;
}

/** A course with its attached areas of study, used once a course is selected. */
export interface PlannerCourseWithAoS extends PlannerCourse {
  areasOfStudy: PlannerAreaOfStudy[];
}

/** Planner state lives client-side. This is the shape persisted/restored. */
export interface PlannerState {
  courseYear: string;
  courseCode: string | null;
  /**
   * Picked AoS codes, one per `kind`. The shape matches what a BIT student
   * actually picks: one major (+ optionally an elective major), one minor,
   * a specialisation, etc. We store by role so requirement-progress can
   * look up "the picked major" quickly.
   */
  selectedAos: {
    major?: string;
    extendedMajor?: string;
    minor?: string;
    specialisation?: string;
    elective?: string;
  };
  years: PlannerYear[];
}

export interface PlannerYear {
  /** Display label like "Year 1" — not the handbook year. */
  label: string;
  slots: PlannerSlot[];
}

export interface PlannerSlot {
  kind: PeriodKind;
  unitCodes: string[];
  /**
   * Target count of units in this slot. Defaults to 4 (24cp full-time
   * load) when undefined. Bounded to [unitCodes.length, 8] in the UI.
   * Persisted per-slot so a student can plan a deliberate 3-unit
   * semester or a 5-unit intensive without those settings leaking
   * across other slots.
   */
  capacity?: number;
}

export const DEFAULT_SLOT_CAPACITY = 4;
export const MAX_SLOT_CAPACITY = 8;

export function slotCapacity(slot: PlannerSlot): number {
  return slot.capacity ?? DEFAULT_SLOT_CAPACITY;
}

/** Output of validating a single slot/unit pairing. */
export interface SlotUnitValidation {
  code: string;
  /** Hard errors — render unit red, block count toward progress. */
  errors: ValidationIssue[];
  /** Soft — render unit amber/yellow. */
  warnings: ValidationIssue[];
}

export type ValidationIssueKind =
  | "not_offered_in_period"
  | "prereq_unmet"
  | "coreq_unmet"
  | "prohibition_conflict"
  | "over_credit_load"
  | "unknown_unit";

export interface ValidationIssue {
  kind: ValidationIssueKind;
  message: string;
  /** For prereq/coreq/prohibition issues, the codes that would satisfy it. */
  relatedCodes?: string[];
}
