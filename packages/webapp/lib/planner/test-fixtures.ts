/**
 * Builders for planner tests. Not a *.test.ts file, so the test runner
 * doesn't execute it. Each builder fills the fields a test doesn't
 * care about; pass `overrides` for the ones it does.
 */
import type {
  PeriodKind,
  PlannerOffering,
  PlannerSlot,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
  RequisiteRule,
} from "./types.ts"

export function unit(
  code: string,
  overrides: Partial<PlannerUnit> = {}
): PlannerUnit {
  return {
    year: "2026",
    code,
    title: code,
    creditPoints: 6,
    level: null,
    school: null,
    ...overrides,
  }
}

/** Map of units by code, all with the same overrides. */
export function unitMap(
  codes: readonly string[],
  overrides: Partial<PlannerUnit> = {}
): Map<string, PlannerUnit> {
  return new Map(codes.map((c) => [c, unit(c, overrides)]))
}

/** Handbook names for each period kind; OTHER gets a term. */
const TEACHING_PERIOD: Record<PeriodKind, string> = {
  S1: "First semester",
  S2: "Second semester",
  SUMMER_A: "Summer semester A",
  SUMMER_B: "Summer semester B",
  WINTER: "Winter semester",
  FULL_YEAR: "Full year",
  OTHER: "Term 2",
}

export function offering(
  code: string,
  periodKind: PeriodKind,
  overrides: Partial<PlannerOffering> = {}
): PlannerOffering {
  return {
    unitCode: code,
    teachingPeriod: TEACHING_PERIOD[periodKind],
    location: "Clayton",
    attendanceModeCode: "ON-CAMPUS",
    periodKind,
    ...overrides,
  }
}

/** `{ FIT1045: ["S1", "S2"] }` → offerings by code, one per period. */
export function offeringMap(
  byCode: Record<string, readonly PeriodKind[]>
): Map<string, PlannerOffering[]> {
  return new Map(
    Object.entries(byCode).map(([code, kinds]) => [
      code,
      kinds.map((k) => offering(code, k)),
    ])
  )
}

/** A slot's units, or the whole slot when a test needs more fields. */
type SlotSpec = readonly string[] | Omit<PlannerSlot, "kind">

/**
 * A plan with one entry per study year, each mapping a period kind to
 * its units in slot order: `planState([{ S1: ["FIT1045"], S2: [] }])`.
 */
export function planState(
  years: ReadonlyArray<Partial<Record<PeriodKind, SlotSpec>>>,
  overrides: Partial<PlannerState> = {}
): PlannerState {
  return {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: years.map((slots, i) => ({
      label: `Year ${i + 1}`,
      slots: Object.entries(slots).map(([kind, spec]) =>
        isCodeList(spec)
          ? { kind: kind as PeriodKind, unitCodes: [...spec] }
          : {
              kind: kind as PeriodKind,
              ...spec,
              unitCodes: [...spec.unitCodes],
            }
      ),
    })),
    ...overrides,
  }
}

function isCodeList(spec: SlotSpec | undefined): spec is readonly string[] {
  return Array.isArray(spec)
}

/** One container whose leaves combine under `connector`. */
export function rule(
  connector: "AND" | "OR",
  codes: readonly string[]
): RequisiteRule {
  return [
    {
      parent_connector: { value: connector, label: connector },
      relationships: codes.map((c) => ({ academic_item_code: c })),
    },
  ]
}

export function requisite(
  requisiteType: RequisiteBlock["requisiteType"],
  codes: readonly string[],
  connector: "AND" | "OR" = "AND"
): RequisiteBlock {
  return { requisiteType, rule: rule(connector, codes) }
}

/** Prerequisite needing every code. */
export const prereq = (...codes: string[]) =>
  requisite("prerequisite", codes, "AND")
/** Prerequisite met by any one code. */
export const prereqAny = (...codes: string[]) =>
  requisite("prerequisite", codes, "OR")
export const coreq = (...codes: string[]) =>
  requisite("corequisite", codes, "AND")
export const prohibition = (...codes: string[]) =>
  requisite("prohibition", codes, "OR")
