import type { PlannerOffering, PlannerState } from "./types.ts"

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
