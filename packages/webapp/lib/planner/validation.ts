import { creditedCodes } from "./credit.ts"
import { perSlotCreditPoints } from "./full-year.ts"
import { plannedUnitCodes } from "./progress.ts"
import {
  describeMissing,
  evaluateProhibition,
  evaluateRequisiteTree,
  referencedCodes,
} from "./requisites.ts"
import { PERIOD_KIND_LABEL } from "./teaching-period.ts"
import { slotCalendarYear } from "./timeline.ts"
import {
  adviceSentence,
  afterLastOffering,
  beforeFirstOffering,
  termLabel,
  TRANSITIONS,
  type TransitionEntry,
  type Transitions,
} from "./transitions.ts"
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
 *   completed   = advanced standing + every unit in earlier years +
 *                 earlier periods of the same year
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
  /**
   * Other units on the plan whose own prohibition rules name this one.
   * Covers the direction this unit's rules don't state; see the
   * prohibition block below. Optional — omitting it restores the
   * one-directional behaviour.
   */
  prohibitedBy?: readonly string[]
  concurrentWith: ReadonlySet<string>
  allPlannedCodes: ReadonlySet<string>
  offerings: PlannerOffering[]
  requisites: RequisiteBlock[]
  slotCreditLoad: number
  /**
   * Calendar year this slot falls in (see slotCalendarYear).
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
  transitions?: Transitions
}

export function validateUnitInSlot(input: ValidationInput): SlotUnitValidation {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  const offering = offeringIssue({
    unit: input.unit,
    offerings: input.offerings,
    slotKind: input.slotKind,
    slotYear: input.expectedHandbookYear,
    transitions: input.transitions,
  })
  if (offering?.severity === "error") errors.push(offering.issue)
  else if (offering) warnings.push(offering.issue)

  const prereqs = input.requisites.filter(
    (r) => r.requisiteType === "prerequisite"
  )
  for (const block of prereqs) {
    const res = evaluateRequisiteTree(block.rule, input.completedBefore)
    if (!res.satisfied) {
      errors.push({
        kind: "prereq_unmet",
        message: `Prerequisite not satisfied: need ${describeMissing(block.rule, input.completedBefore)} before ${input.unit.code}.`,
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
        message: `Corequisite not satisfied: need ${describeMissing(block.rule, combined)} by the end of this slot.`,
        relatedCodes: res.missingCodes,
      })
    }
  }

  // Prohibitions are mutual in practice but recorded one-directionally
  // about half the time — 1,557 of 2026's 3,041 edges name a unit that
  // doesn't name them back. Checking only this unit's own rule means
  // the conflict lights up on one card and not the other: "when i put
  // ats 3146 and ats 2146 only 2146 showed a prohibition but 3146
  // didnt". So the reverse direction (units on the plan whose rules
  // name *this* unit) counts too, merged into one error rather than
  // reported twice for a mutual pair.
  const conflicts = new Set<string>()
  for (const block of input.requisites) {
    if (block.requisiteType !== "prohibition") continue
    const res = evaluateProhibition(block.rule, input.allPlannedCodes)
    for (const c of res.conflictingCodes) conflicts.add(c)
  }
  for (const c of input.prohibitedBy ?? []) conflicts.add(c)
  if (conflicts.size > 0) {
    const codes = [...conflicts].sort()
    errors.push({
      kind: "prohibition_conflict",
      message: `Can't take with ${formatCodeList(codes)}.`,
      relatedCodes: codes,
    })
  }

  if (input.slotCreditLoad > MAX_CREDIT_LOAD_PER_SLOT) {
    warnings.push({
      kind: "over_credit_load",
      message: `Slot has ${input.slotCreditLoad} credit points - the standard full-time load is ${MAX_CREDIT_LOAD_PER_SLOT}.`,
    })
  }

  return { code: input.unit.code, errors, warnings }
}

export function isOfferedInPeriod(
  offerings: readonly PlannerOffering[],
  period: PeriodKind
): boolean {
  return offerings.some((o) => covers(o.periodKind, period))
}

function covers(offered: PeriodKind, slot: PeriodKind): boolean {
  // Year-long offerings cover both S1 and S2 — a FY unit placed in
  // either semester slot is still "being attended" that semester.
  return (
    offered === slot ||
    (offered === "FULL_YEAR" && (slot === "S1" || slot === "S2"))
  )
}

export interface OfferingIssue {
  severity: "error" | "warning"
  issue: ValidationIssue
  /** Short form for chips: "Final offering Semester 2, 2027". */
  label: string
}

/**
 * Whether a unit runs in a slot. The slot year's handbook wins, then a
 * faculty transition; a new unit with no offerings only warns.
 */
export function offeringIssue(args: {
  unit: Pick<PlannerUnit, "code" | "year" | "firstYear">
  offerings: readonly PlannerOffering[]
  slotKind: PeriodKind
  slotYear?: string
  transitions?: Transitions
}): OfferingIssue | null {
  const { unit, offerings, slotKind } = args
  const slotYear = args.slotYear ?? unit.year
  const reliable = unit.year === slotYear
  const offered = isOfferedInPeriod(offerings, slotKind)
  if (reliable && offered) return null

  const { code } = unit
  const period = PERIOD_KIND_LABEL[slotKind]
  const notOffered = `Not offered in ${period}`
  const entry = (args.transitions ?? TRANSITIONS).byCode.get(code)
  if (entry && afterLastOffering(entry.unit, slotKind, Number(slotYear)))
    return noLongerOffered(entry)
  const t = entry?.unit
  if (entry && t?.firstOffered && offerings.length === 0) {
    if (beforeFirstOffering(t, slotKind, Number(slotYear)))
      return notYetOffered(entry)
    const from = termLabel(t.firstOffered)
    if (!t.periods)
      return warning(
        "Periods not published",
        `${code} is a new unit from ${from}. Its teaching periods aren't published yet, so check them with your faculty.`
      )
    if (t.periods.some((p) => covers(p, slotKind))) return null
    const runs = t.periods.map((p) => PERIOD_KIND_LABEL[p]).join(" and ")
    return warning(
      notOffered,
      `${code} runs in ${runs} from ${from}, not ${period}.`
    )
  }
  if (offered) return null

  // Term-only units (IBL placements / onboarding, trimester field
  // schools, …) have every offering classified as OTHER and so will
  // *never* match an S1/S2 slot, even when the data is fresh. The
  // unit still needs to live somewhere on the planner grid, so flag
  // it as a yellow "runs on its own dates — check them"
  // rather than a red blocker.
  if (offerings.length > 0 && offerings.every((o) => o.periodKind === "OTHER"))
    return warning(
      "Runs on its own dates",
      `${code} runs on its own dates, not the semester calendar, so it may start before or end after ${period}. Check the dates with your faculty.`
    )
  if (offerings.length === 0 && unit.firstYear === unit.year)
    return warning(
      "No offerings published",
      `${code} is a new unit with no offerings in the ${unit.year} handbook yet. Check when it first runs.`
    )
  if (!reliable)
    return warning(
      notOffered,
      `${code} isn't offered in ${period} in the ${unit.year} handbook - ${slotYear} offerings may differ.`
    )
  return {
    severity: "error",
    label: notOffered,
    issue: {
      kind: "not_offered_in_period",
      message: `${code} isn't offered in ${period} for ${unit.year}.`,
    },
  }
}

function warning(label: string, message: string): OfferingIssue {
  return {
    severity: "warning",
    label,
    issue: { kind: "not_offered_in_period", message },
  }
}

function noLongerOffered(entry: TransitionEntry): OfferingIssue {
  const { code, lastOffered } = entry.unit
  const final = lastOffered!.period ? termLabel(lastOffered!) : null
  const status = final
    ? `${code}'s final offering is ${final}.`
    : `${code} is no longer offered from ${lastOffered!.year + 1}.`
  return {
    severity: "error",
    label: final ? `Final offering ${final}` : "No longer offered",
    issue: {
      kind: "no_longer_offered",
      message: [status, adviceSentence(entry)].filter(Boolean).join(" "),
    },
  }
}

function notYetOffered(entry: TransitionEntry): OfferingIssue {
  const first = termLabel(entry.unit.firstOffered!)
  return {
    severity: "error",
    label: `New from ${first}`,
    issue: {
      kind: "not_yet_offered",
      message: `${entry.unit.code} is a new unit and first runs in ${first}.`,
    },
  }
}

/** Retired units have no page in later handbooks. */
function missingUnitIssue(
  code: string,
  slotKind: PeriodKind,
  slotYear: string | undefined,
  transitions: Transitions
): ValidationIssue {
  const entry = transitions.byCode.get(code)
  if (entry && afterLastOffering(entry.unit, slotKind, Number(slotYear)))
    return noLongerOffered(entry).issue
  if (entry && beforeFirstOffering(entry.unit, slotKind, Number(slotYear)))
    return notYetOffered(entry).issue
  return {
    kind: "unknown_unit",
    message: `Unit ${code} not found in this handbook year.`,
  }
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
  requisitesByCode: ReadonlyMap<string, RequisiteBlock[]>,
  transitions: Transitions = TRANSITIONS
): Map<string, SlotUnitValidation> {
  const out = new Map<string, SlotUnitValidation>()

  // Advanced standing counts as study already done, before Year 1.
  // This is the whole point of the feature: a student credited with
  // FIT1045 must stop seeing "prerequisite not met" on FIT1008, and a
  // student who accelerated into ENG2005 must stop being told ENG1005
  // is missing. Credited codes are literal enrolments for prohibition
  // purposes too — holding credit for a unit conflicts with its twin
  // exactly as taking it would.
  const allPlanned = plannedUnitCodes(state)

  // Reverse prohibition index: code -> units on the plan whose own
  // rules prohibit it. Built once over the plan rather than per slot,
  // since it depends only on what's placed. `allPlanned` includes
  // credited units, so credit for a unit conflicts with its twin from
  // this direction too — consistent with credit counting as a literal
  // enrolment for prohibitions.
  const prohibitedBy = new Map<string, Set<string>>()
  for (const owner of allPlanned) {
    for (const block of requisitesByCode.get(owner) ?? []) {
      if (block.requisiteType !== "prohibition") continue
      for (const target of referencedCodes(block.rule)) {
        if (target === owner || !allPlanned.has(target)) continue
        const set = prohibitedBy.get(target) ?? new Set<string>()
        set.add(owner)
        prohibitedBy.set(target, set)
      }
    }
  }

  // Grown slot by slot below rather than calling completedBefore per
  // slot, which would walk the plan again for every slot.
  const completed = completedAtStart(state, unitsByCode, transitions)

  // Used to derive the expected handbook year per slot so the
  // validator can compare against the actually-loaded `unit.year`.
  // If courseYear isn't a parseable number (shouldn't happen, but be
  // defensive), every slot falls back to treating its data as
  // authoritative — same behaviour as not passing expectedHandbookYear.
  const courseYearNum = Number(state.courseYear)
  const courseYearIsNumeric = Number.isFinite(courseYearNum)

  for (let y = 0; y < state.years.length; y++) {
    const year = state.years[y]
    for (let s = 0; s < year.slots.length; s++) {
      const slot = year.slots[s]
      const expectedHandbookYear = courseYearIsNumeric
        ? String(slotCalendarYear(state, y, slot.kind))
        : undefined
      // Equivalents (advanced twins, cross-listings) count as having
      // taken the unit they're equivalent to, so a prereq/coreq naming
      // FIT1045 is met by completing FIT1053. Prohibitions are checked
      // against literal enrolments (allPlanned), so they're not expanded.
      const concurrent = withEquivalents(
        slot.unitCodes,
        unitsByCode,
        transitions
      )

      // Per-slot CP load — full-year units contribute their half-year
      // share so a 12 CP FY twin doesn't single-handedly trip the
      // over-credit-load warning in both S1 and S2 of the same year.
      const slotCreditLoad = slot.unitCodes.reduce(
        (sum, c) =>
          sum + perSlotCreditPoints(c, slot.kind, unitsByCode, offeringsByCode),
        0
      )

      for (const code of slot.unitCodes) {
        const unit = unitsByCode.get(code)
        if (!unit) {
          out.set(keyFor(y, s, code), {
            code,
            errors: [
              missingUnitIssue(
                code,
                slot.kind,
                expectedHandbookYear,
                transitions
              ),
            ],
            warnings: [],
          })
          continue
        }

        const concurrentWithoutSelf = new Set(concurrent)
        concurrentWithoutSelf.delete(code)

        const earlier = earlierTermUnits(code, slot.unitCodes, offeringsByCode)
        const completedForUnit = earlier.length
          ? new Set([
              ...completed,
              ...withEquivalents(earlier, unitsByCode, transitions),
            ])
          : completed

        const v = validateUnitInSlot({
          unit,
          slotKind: slot.kind,
          yearIndex: y,
          slotIndex: s,
          completedBefore: completedForUnit,
          concurrentWith: concurrentWithoutSelf,
          prohibitedBy: [...(prohibitedBy.get(code) ?? [])],
          allPlannedCodes: new Set([...allPlanned].filter((c) => c !== code)),
          offerings: offeringsByCode.get(code) ?? [],
          requisites: requisitesByCode.get(code) ?? [],
          slotCreditLoad,
          // The hydration layer fetches a slot's unit data from the
          // handbook for the slot's calendar year when available,
          // falling back to the latest published year when it isn't. If
          // that fallback kicked in (loaded year ≠ slot year), the period
          // mismatch is a stale-data forecast, not a hard fact, and
          // downgrades to amber. See hydration.ts / slotHandbookYear.
          expectedHandbookYear,
          transitions,
        })
        out.set(keyFor(y, s, code), v)
      }

      for (const c of concurrent) completed.add(c)
    }
  }

  return out
}

/**
 * Units in the same slot that finish before `code` starts. Only term
 * units qualify: the IBL program runs FIT3201/FIT3202 onboarding in
 * Term 1 or 3 and the FIT4042/FIT3045 placement straight after in
 * Term 2 or 4, so both sit in one semester slot yet the onboarding is
 * a real prerequisite taken first. A unit with any offering that is
 * not a numbered term never counts, since its timing can't be ordered.
 */
export function earlierTermUnits(
  code: string,
  slotCodes: readonly string[],
  offeringsByCode: ReadonlyMap<string, PlannerOffering[]>
): string[] {
  const own = termNumbers(offeringsByCode.get(code))
  if (!own) return []
  const latest = Math.max(...own)
  return slotCodes.filter((other) => {
    if (other === code) return false
    const terms = termNumbers(offeringsByCode.get(other))
    return terms !== null && Math.min(...terms) < latest
  })
}

/** Term numbers a unit runs in, or null unless every offering is a "Term N". */
function termNumbers(
  offerings: readonly PlannerOffering[] | undefined
): number[] | null {
  if (!offerings?.length) return null
  const out: number[] = []
  for (const o of offerings) {
    const m = /^Term (\d+)$/i.exec(o.teachingPeriod.trim())
    if (!m) return null
    out.push(Number(m[1]))
  }
  return out
}

/**
 * What counts as done before Year 1: advanced standing, expanded
 * through equivalents like any other completion, so credit for FIT1053
 * satisfies a prerequisite naming FIT1045.
 */
export function completedAtStart(
  state: PlannerState,
  unitsByCode: ReadonlyMap<string, Pick<PlannerUnit, "equivalents">>,
  transitions: Transitions = TRANSITIONS
): Set<string> {
  return withEquivalents(creditedCodes(state), unitsByCode, transitions)
}

/**
 * Codes completed strictly before slot (yearIndex, slotIndex): credit,
 * then every earlier slot in plan order, each expanded through
 * equivalents. The same chronology validatePlan uses, for views that
 * need it for one slot (the search ranking, the detail popover).
 */
export function completedBefore(
  state: PlannerState,
  yearIndex: number,
  slotIndex: number,
  unitsByCode: ReadonlyMap<string, Pick<PlannerUnit, "equivalents">>,
  transitions: Transitions = TRANSITIONS
): Set<string> {
  const out = completedAtStart(state, unitsByCode, transitions)
  for (let y = 0; y <= yearIndex; y++) {
    const slots = state.years[y]?.slots ?? []
    for (let s = 0; s < slots.length; s++) {
      if (y === yearIndex && s >= slotIndex) break
      for (const c of withEquivalents(
        slots[s].unitCodes,
        unitsByCode,
        transitions
      ))
        out.add(c)
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

/**
 * Expand a set of taken/planned codes to also include each unit's
 * equivalents (advanced twins, faculty cross-listings, campus variants —
 * see PlannerUnit.equivalents). Returns a new set; the input is left
 * untouched. Used wherever "what has the student effectively completed?"
 * feeds requisite satisfaction, so e.g. completing FIT1053 satisfies a
 * prerequisite that names FIT1045. Approved replacements count too. NOT
 * used for prohibition checks, which test literal enrolments.
 */
export function withEquivalents(
  codes: Iterable<string>,
  unitsByCode: ReadonlyMap<string, Pick<PlannerUnit, "equivalents">>,
  transitions: Transitions = TRANSITIONS
): Set<string> {
  const out = new Set<string>()
  for (const c of codes) {
    out.add(c)
    for (const eq of unitsByCode.get(c)?.equivalents ?? []) out.add(eq)
    for (const r of transitions.countsAs.get(c) ?? []) out.add(r)
  }
  return out
}
