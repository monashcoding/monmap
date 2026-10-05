import { isFullYearUnit, perSlotCreditPoints } from "./full-year.ts"
import { slotBlockCredit } from "./timeline.ts"
import {
  slotCapacity,
  STANDARD_CP,
  type PeriodKind,
  type PlannerOffering,
  type PlannerSlot,
  type PlannerState,
} from "./types.ts"

/**
 * How much room units take in a slot, and whether a slot can take
 * another one. Every capacity check in the planner goes through here:
 * the grid's column spans, the "3/4" gauge, the drop and "Add to…"
 * rules, the reducer's guards and auto-fill.
 */

type UnitCp = ReadonlyMap<string, { creditPoints: number }>
type Offerings = ReadonlyMap<string, PlannerOffering[]>

/** False for leave/exchange semesters and locked ones. */
export function slotTakesUnits(
  slot: Pick<PlannerSlot, "status" | "locked">
): boolean {
  return !slot.status && !slot.locked
}

/**
 * Credit points a unit shows in one slot: half for a full-year twin in
 * S1/S2, and STANDARD_CP while the unit's data hasn't loaded. Without
 * `offerings` a full-year twin counts in full, which overestimates —
 * the safe direction for capacity.
 */
export function unitSlotCreditPoints(
  code: string,
  slotKind: PeriodKind,
  units: UnitCp,
  offerings?: Offerings
): number {
  const unit = units.get(code)
  if (!unit) return STANDARD_CP
  return offerings
    ? perSlotCreditPoints(code, slotKind, units, offerings)
    : unit.creditPoints
}

/**
 * Columns a unit takes in a slot, with 6 CP as one column: a 12 CP
 * unit takes 2, an 18 CP unit 3, a 12 CP full-year twin 1 in each
 * semester. A 0 CP unit still takes one column, since it is a card.
 */
export function unitSlotWeight(
  code: string,
  slotKind: PeriodKind,
  units: UnitCp,
  offerings?: Offerings
): number {
  const cp = unitSlotCreditPoints(code, slotKind, units, offerings)
  return Math.max(1, Math.round(cp / STANDARD_CP))
}

/** Columns used in a slot: the sum of its units' weights. */
export function slotUsedWeight(
  slot: Pick<PlannerSlot, "kind" | "unitCodes">,
  units: UnitCp,
  offerings?: Offerings
): number {
  return slot.unitCodes.reduce(
    (sum, code) => sum + unitSlotWeight(code, slot.kind, units, offerings),
    0
  )
}

/**
 * A slot's credit points as one row of the plan shows them: an
 * exchange block, or its units at their per-slot CP. Retakes and
 * full-year halves count here because they are real workload; degree
 * totals come from summarizePlan, which counts each code once.
 */
export function slotCreditPoints(
  slot: Pick<PlannerSlot, "kind" | "unitCodes" | "status" | "creditPoints">,
  units: UnitCp,
  offerings?: Offerings
): number {
  return slot.unitCodes.reduce(
    (sum, code) =>
      sum + unitSlotCreditPoints(code, slot.kind, units, offerings),
    slotBlockCredit(slot)
  )
}

export type PlaceBlock =
  /** No slot at that position. */
  | "missing"
  | "locked"
  | "leave"
  | "exchange"
  /** The slot holds the code, or for a full-year unit, its year does. */
  | "duplicate"
  | "full"
  /** A full-year unit needs both S1 and S2 in the year. */
  | "no_twin"

/**
 * Can `code` go into this slot? A full-year unit lands in S1 and S2 of
 * the year whatever slot was picked, so both halves are checked as well
 * as the picked slot. "Full" means no open column, as the grid shows it.
 */
export function canPlaceUnit(
  state: Pick<PlannerState, "years">,
  yearIndex: number,
  slotIndex: number,
  code: string,
  units: UnitCp,
  offerings: Offerings
): { ok: true } | { ok: false; reason: PlaceBlock } {
  const year = state.years[yearIndex]
  const target = year?.slots[slotIndex]
  if (!year || !target) return { ok: false, reason: "missing" }

  // The slots the unit will sit in.
  let into: PlannerSlot[] = [target]
  if (isFullYearUnit(code, offerings)) {
    const s1 = year.slots.find((s) => s.kind === "S1")
    const s2 = year.slots.find((s) => s.kind === "S2")
    if (!s1 || !s2) return { ok: false, reason: "no_twin" }
    if (year.slots.some((s) => s.unitCodes.includes(code)))
      return { ok: false, reason: "duplicate" }
    into = [s1, s2]
  }

  for (const s of new Set([target, ...into])) {
    if (s.locked) return { ok: false, reason: "locked" }
    if (s.status) return { ok: false, reason: s.status }
  }
  for (const s of into) {
    if (s.unitCodes.includes(code)) return { ok: false, reason: "duplicate" }
    if (slotUsedWeight(s, units, offerings) >= slotCapacity(s))
      return { ok: false, reason: "full" }
  }
  return { ok: true }
}
