import { evaluateProhibition, evaluateRequisiteTree } from "./requisites.ts"
import type {
  PeriodKind,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
  SlotUnitValidation,
  ValidationIssue,
} from "./types.ts"

const MAX_CREDIT_LOAD_PER_SLOT = 24

/**
 * Per-unit-in-slot validation. Returns hard errors (red) and soft
 * warnings (amber).
 *
 * Chronology model: a unit placed in slot (yearIndex, period) has
 *   completed   = every unit in earlier years + earlier periods of the
 *                 same year
 *   concurrent  = every other unit in the same slot
 * Prereqs are satisfied iff their rule is met by `completed`.
 * Coreqs are satisfied iff their rule is met by `completed ∪ concurrent`.
 * Prohibitions trip iff any referenced unit appears in the student's
 *   entire plan (past, present, future) — enrolling in any of them
 *   ever blocks you, symmetric.
 *
 * Offerings: the unit must have at least one offering with the same
 * period-kind as the slot. We don't check location here — students
 * move between campuses, the UI shows availability as a hint only.
 */
export interface ValidationInput {
  unit: PlannerUnit
  slotKind: PeriodKind
  yearIndex: number
  slotIndex: number
  completedBefore: ReadonlySet<string>
  concurrentWith: ReadonlySet<string>
  allPlannedCodes: ReadonlySet<string>
  offerings: PlannerOffering[]
  requisites: RequisiteBlock[]
  slotCreditLoad: number
  /**
   * Calendar year this slot represents (courseYear + studyYearIndex).
   * When it matches `unit.year` the loaded handbook *is* the right one
   * for this slot and a period mismatch is a hard error. When it
   * differs, we're forecasting against a different handbook year — the
   * hydration layer either fell back to the latest available year or
   * the slot is past the latest published handbook — so we downgrade
   * `not_offered_in_period` to a warning, since Monash routinely
   * rotates units between semesters year-on-year. Defaults to
   * `unit.year` (treats data as authoritative for the slot).
   */
  expectedHandbookYear?: string
}

export function validateUnitInSlot(input: ValidationInput): SlotUnitValidation {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  const expectedYear = input.expectedHandbookYear ?? input.unit.year
  const dataIsReliable = input.unit.year === expectedYear

  if (!isOfferedInPeriod(input.offerings, input.slotKind)) {
    // Term-only units (IBL placements / onboarding, trimester field
    // schools, …) have every offering classified as OTHER and so will
    // *never* match an S1/S2 slot, even when the data is fresh. The
    // unit still needs to live somewhere on the planner grid, so flag
    // it as a yellow "non-standard schedule — verify timing manually"
    // rather than a red blocker.
    const termOnly =
      input.offerings.length > 0 &&
      input.offerings.every((o) => o.periodKind === "OTHER")
    const issue: ValidationIssue = {
      kind: "not_offered_in_period",
      message: termOnly
        ? `${input.unit.code} runs on a non-standard schedule (${formatPeriodList(input.offerings)}); verify it overlaps ${periodLabel(input.slotKind)}.`
        : dataIsReliable
          ? `${input.unit.code} isn't offered in ${periodLabel(input.slotKind)} for ${input.unit.year}.`
          : `${input.unit.code} isn't offered in ${periodLabel(input.slotKind)} in the ${input.unit.year} handbook — ${expectedYear} offerings may differ.`,
    }
    if (termOnly || !dataIsReliable) warnings.push(issue)
    else errors.push(issue)
  }

  const prereqs = input.requisites.filter(
    (r) => r.requisiteType === "prerequisite"
  )
  for (const block of prereqs) {
    const res = evaluateRequisiteTree(block.rule, input.completedBefore)
    if (!res.satisfied) {
      errors.push({
        kind: "prereq_unmet",
        message: `Prerequisite not satisfied: need ${formatCodeList(res.missingCodes)} before ${input.unit.code}.`,
        relatedCodes: res.missingCodes,
      })
    }
  }

  const coreqs = input.requisites.filter(
    (r) => r.requisiteType === "corequisite"
  )
  for (const block of coreqs) {
    const combined = new Set<string>([
      ...input.completedBefore,
      ...input.concurrentWith,
    ])
    const res = evaluateRequisiteTree(block.rule, combined)
    if (!res.satisfied) {
      errors.push({
        kind: "coreq_unmet",
        message: `Corequisite not satisfied: need ${formatCodeList(res.missingCodes)} by the end of this slot.`,
        relatedCodes: res.missingCodes,
      })
    }
  }

  const prohibitions = input.requisites.filter(
    (r) => r.requisiteType === "prohibition"
  )
  for (const block of prohibitions) {
    const res = evaluateProhibition(block.rule, input.allPlannedCodes)
    if (!res.satisfied) {
      errors.push({
        kind: "prohibition_conflict",
        message: `Can't take with ${formatCodeList(res.conflictingCodes)}.`,
        relatedCodes: res.conflictingCodes,
      })
    }
  }

  if (input.slotCreditLoad > MAX_CREDIT_LOAD_PER_SLOT) {
    warnings.push({
      kind: "over_credit_load",
      message: `Slot has ${input.slotCreditLoad} credit points — the standard full-time load is ${MAX_CREDIT_LOAD_PER_SLOT}.`,
    })
  }

  return { code: input.unit.code, errors, warnings }
}

export function isOfferedInPeriod(
  offerings: PlannerOffering[],
  period: PeriodKind
): boolean {
  return offerings.some((o) => {
    if (o.periodKind === period) return true
    // Year-long offerings cover both S1 and S2 — a FY unit placed in
    // either semester slot is still "being attended" that semester.
    if (o.periodKind === "FULL_YEAR" && (period === "S1" || period === "S2")) {
      return true
    }
    return false
  })
}

export function periodLabel(period: PeriodKind): string {
  switch (period) {
    case "S1":
      return "Semester 1"
    case "S2":
      return "Semester 2"
    case "SUMMER_A":
      return "Summer A"
    case "SUMMER_B":
      return "Summer B"
    case "WINTER":
      return "Winter"
    case "FULL_YEAR":
      return "Full year"
    case "OTHER":
      return "Other"
  }
}

/**
 * Render a list of teaching periods from the offerings, deduped. Used
 * in the "non-standard schedule" warning to tell the student what
 * timing the unit actually runs in (e.g. "Term 1, Term 3").
 */
function formatPeriodList(offerings: PlannerOffering[]): string {
  const seen = new Set<string>()
  for (const o of offerings) seen.add(o.teachingPeriod)
  const list = [...seen].sort()
  if (list.length === 0) return "off-cycle"
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} or ${list[1]}`
  return `${list.slice(0, -1).join(", ")} or ${list.at(-1)}`
}

function formatCodeList(codes: string[]): string {
  if (codes.length === 0) return "(no data)"
  if (codes.length === 1) return codes[0]
  if (codes.length === 2) return `${codes[0]} or ${codes[1]}`
  return `${codes.slice(0, -1).join(", ")} or ${codes.at(-1)}`
}

/**
 * Walk the whole plan once and return per-slot-per-unit validation.
 * Keyed by `${yearIndex}:${slotIndex}:${code}`.
 */
export function validatePlan(
  state: PlannerState,
  unitsByCode: ReadonlyMap<string, PlannerUnit>,
  offeringsByCode: ReadonlyMap<string, PlannerOffering[]>,
  requisitesByCode: ReadonlyMap<string, RequisiteBlock[]>
): Map<string, SlotUnitValidation> {
  const out = new Map<string, SlotUnitValidation>()

  const allPlanned = new Set<string>()
  for (const yr of state.years)
    for (const s of yr.slots) for (const c of s.unitCodes) allPlanned.add(c)

  const completed = new Set<string>()

  // Used to derive the expected handbook year per study-year so the
  // validator can compare against the actually-loaded `unit.year`.
  // If courseYear isn't a parseable number (shouldn't happen, but be
  // defensive), every slot falls back to treating its data as
  // authoritative — same behaviour as not passing expectedHandbookYear.
  const courseYearNum = Number(state.courseYear)
  const courseYearIsNumeric = Number.isFinite(courseYearNum)

  for (let y = 0; y < state.years.length; y++) {
    const year = state.years[y]
    const expectedHandbookYear = courseYearIsNumeric
      ? String(courseYearNum + y)
      : undefined
    for (let s = 0; s < year.slots.length; s++) {
      const slot = year.slots[s]
      const concurrent = new Set(slot.unitCodes)

      const slotCreditLoad = slot.unitCodes.reduce(
        (sum, c) => sum + (unitsByCode.get(c)?.creditPoints ?? 0),
        0
      )

      for (const code of slot.unitCodes) {
        const unit = unitsByCode.get(code)
        if (!unit) {
          out.set(keyFor(y, s, code), {
            code,
            errors: [
              {
                kind: "unknown_unit",
                message: `Unit ${code} not found in this handbook year.`,
              },
            ],
            warnings: [],
          })
          continue
        }

        const concurrentWithoutSelf = new Set(concurrent)
        concurrentWithoutSelf.delete(code)

        const v = validateUnitInSlot({
          unit,
          slotKind: slot.kind,
          yearIndex: y,
          slotIndex: s,
          completedBefore: completed,
          concurrentWith: concurrentWithoutSelf,
          allPlannedCodes: new Set([...allPlanned].filter((c) => c !== code)),
          offerings: offeringsByCode.get(code) ?? [],
          requisites: requisitesByCode.get(code) ?? [],
          slotCreditLoad,
          // The hydration layer fetches a year-N slot's unit data from
          // handbook year (courseYear + N) when available, falling back
          // to the latest published year when it isn't. If that fallback
          // kicked in (loaded year ≠ slot year), the period mismatch is
          // a stale-data forecast, not a hard fact, and downgrades to
          // amber. See use-unit-data-hydration.ts / handbookYearFor.
          expectedHandbookYear,
        })
        out.set(keyFor(y, s, code), v)
      }

      for (const c of slot.unitCodes) completed.add(c)
    }
  }

  return out
}

export function keyFor(
  yearIndex: number,
  slotIndex: number,
  code: string
): string {
  return `${yearIndex}:${slotIndex}:${code}`
}
