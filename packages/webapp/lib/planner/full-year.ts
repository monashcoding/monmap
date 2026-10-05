import type { PeriodKind, PlannerOffering } from "./types.ts"

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
 * "Year-long" = the unit, while planned, occupies the student's whole
 * year, so auto-fill books it into both S1 and S2. Two flavours:
 *   - genuine full-year offerings (FY teaching period, no S1/S2).
 *   - IBL placements and the like: credit-bearing (≥ 12 CP) but every
 *     offering classifies as `OTHER` (Term N, Trimester N, …). These
 *     run full-time across several months and rule out S1/S2 study
 *     just as a tagged-FY unit does.
 *
 * Only the first flavour is a full-year *twin* (isFullYearUnit) with
 * half its CP in each semester; an IBL unit counts in full in both.
 */
export function isYearLongUnit(
  offers: readonly PlannerOffering[],
  creditPoints: number
): boolean {
  if (offers.length === 0) return false
  const hasFY = offers.some((o) => o.periodKind === "FULL_YEAR")
  const hasS1 = offers.some((o) => o.periodKind === "S1")
  const hasS2 = offers.some((o) => o.periodKind === "S2")
  if (hasFY && !hasS1 && !hasS2) return true
  const allOther = offers.every((o) => o.periodKind === "OTHER")
  return allOther && creditPoints >= 12
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
