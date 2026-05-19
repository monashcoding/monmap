import type { PeriodKind, PlannerOffering, PlannerState } from "./types.ts"

/**
 * A unit is "full year" when its meaningful offerings are exclusively
 * FULL_YEAR — i.e. it cannot be taken in S1 or S2 alone. Summer/winter
 * variants don't disqualify it (rare but they exist as alternatives).
 *
 * If a unit has no offering rows at all, treat it as not full-year so
 * the planner doesn't accidentally pin standard units to S1[0]/S2[0].
 */
export function isFullYearUnit(
  code: string,
  offerings: ReadonlyMap<string, PlannerOffering[]>
): boolean {
  const list = offerings.get(code)
  if (!list || list.length === 0) return false
  let hasFullYear = false
  for (const o of list) {
    if (o.periodKind === "S1" || o.periodKind === "S2") return false
    if (o.periodKind === "FULL_YEAR") hasFullYear = true
  }
  return hasFullYear
}

/**
 * Find which year (if any) a FY unit is currently placed in. Searches
 * both S1 and S2 since the invariant guarantees both contain it.
 */
export function findFullYearLocation(
  state: PlannerState,
  code: string
): { yearIndex: number } | null {
  for (let yi = 0; yi < state.years.length; yi++) {
    for (const s of state.years[yi]?.slots ?? []) {
      if (s.kind !== "S1" && s.kind !== "S2") continue
      if (s.unitCodes.includes(code)) return { yearIndex: yi }
    }
  }
  return null
}

/**
 * Count how many FY units are at the *front* of a slot's unit list.
 * Used to compute the next FY insertion index.
 */
export function countFullYearPrefix(
  unitCodes: readonly string[],
  fullYearCodes: ReadonlySet<string>
): number {
  let n = 0
  for (const c of unitCodes) {
    if (fullYearCodes.has(c)) n++
    else break
  }
  return n
}

/**
 * Effective credit-point load a unit contributes to a single slot.
 *
 * A full-year unit's twins sit in S1 and S2 of the same year, but its
 * actual workload runs *across* the year — naively counting the full
 * CP in each half double-charges every per-slot metric (capacity
 * gauge, over-CP warning, per-semester totals, grid column span). For
 * FY units in S1/S2 we therefore return half the unit's CP; non-FY
 * placements and FY-in-other-period (rare, shouldn't happen) get the
 * full value.
 *
 * Returns 0 when the unit isn't loaded or has no credit points.
 */
export function perSlotCreditPoints(
  code: string,
  slotKind: PeriodKind,
  units: ReadonlyMap<string, { creditPoints: number | null | undefined }>,
  offerings: ReadonlyMap<string, PlannerOffering[]>
): number {
  const cp = units.get(code)?.creditPoints
  if (cp == null || cp <= 0) return 0
  if (
    (slotKind === "S1" || slotKind === "S2") &&
    isFullYearUnit(code, offerings)
  ) {
    return cp / 2
  }
  return cp
}
