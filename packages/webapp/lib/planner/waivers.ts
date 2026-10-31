import { placedUnitCodes } from "./progress.ts"
import type { PlannerPrerequisiteWaiver, PlannerState } from "./types.ts"

/** Waived prerequisite codes, by the unit they're waived for. */
export function waiversByUnit(
  state: Pick<PlannerState, "waivers">
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()

  for (const { unitCode, prerequisiteCode } of state.waivers ?? []) {
    const codes = out.get(unitCode) ?? new Set<string>()
    codes.add(prerequisiteCode)
    out.set(unitCode, codes)
  }

  return out
}

/** What a unit's prerequisites read as met: never its other requisites. */
export function withWaived(
  completed: ReadonlySet<string>,
  waived: ReadonlySet<string> | undefined
): ReadonlySet<string> {
  return waived ? new Set([...completed, ...waived]) : completed
}

/** Waivers for units still placed, the ones worth printing or exporting. */
export function placedWaivers(
  state: Pick<PlannerState, "waivers" | "years">
): PlannerPrerequisiteWaiver[] {
  const placed = placedUnitCodes(state)

  return (state.waivers ?? []).filter((w) => placed.has(w.unitCode))
}
