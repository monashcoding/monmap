import { handbookYearFor } from "./timeline.ts"
import type {
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "./types.ts"

/**
 * Which plan codes the client must (re)fetch, grouped by the handbook
 * year to fetch them from. Pure so the hydration hook's refetch rule
 * can be tested without React.
 */

/** Key for a code requested from a year that returned no unit. */
export function emptyKey(year: string, code: string): string {
  return `${year}|${code}`
}

/**
 * Whether a cached unit is good for a slot that reads handbook year
 * `hYear`. A unit from another year is fresh when it is the fallback
 * the server picked for `hYear` (2027 E3001's ENG1005 comes back with
 * `year: "2026"`, `fallbackFor: "2027"`); refetching it would return
 * the same unit and loop forever.
 */
export function isFreshFor(
  cached: Pick<PlannerUnit, "year" | "fallbackFor"> | undefined,
  hYear: string
): boolean {
  return cached?.year === hYear || cached?.fallbackFor === hYear
}

/**
 * Codes to fetch, by handbook year. Each code is processed at its first
 * occurrence: credit first (from the plan's own handbook year), then
 * slots in study-year order, each slot reading `handbookYearFor` its
 * study year. A code is skipped when its cached unit is fresh for that
 * year and its offerings and requisites are loaded, or when `empty`
 * holds `emptyKey(year, code)` because that request already came back
 * with no unit.
 */
export function codesToHydrate(params: {
  state: Pick<PlannerState, "years" | "credit" | "courseYear">
  availableYears: readonly string[]
  units: ReadonlyMap<string, Pick<PlannerUnit, "year" | "fallbackFor">>
  offerings: ReadonlyMap<string, PlannerOffering[]>
  requisites: ReadonlyMap<string, RequisiteBlock[]>
  empty: ReadonlySet<string>
}): Map<string, string[]> {
  const { state, availableYears, units, offerings, requisites, empty } = params
  const codesByYear = new Map<string, string[]>()
  const seen = new Set<string>()

  const want = (code: string, hYear: string) => {
    if (seen.has(code)) return
    seen.add(code)
    if (empty.has(emptyKey(hYear, code))) return
    if (
      isFreshFor(units.get(code), hYear) &&
      offerings.has(code) &&
      requisites.has(code)
    )
      return
    const list = codesByYear.get(hYear) ?? []
    list.push(code)
    codesByYear.set(hYear, list)
  }

  // Credited units are hydrated too, from the plan's own handbook
  // year: they never sit in a slot, but their `equivalents` decide
  // whether credit for FIT1053 satisfies a prerequisite naming
  // FIT1045.
  const creditYear = handbookYearFor(0, state.courseYear, availableYears)
  for (const entry of state.credit ?? [])
    if (entry.code) want(entry.code, creditYear)

  for (let yi = 0; yi < state.years.length; yi++) {
    const hYear = handbookYearFor(yi, state.courseYear, availableYears)
    for (const slot of state.years[yi]?.slots ?? []) {
      for (const code of slot.unitCodes) want(code, hYear)
    }
  }
  return codesByYear
}
