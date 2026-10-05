"use client"

import { useEffect } from "react"

import { isFullYearUnit } from "@/lib/planner/full-year"
import type { PlannerAction } from "@/lib/planner/state"
import type { PlannerOffering, PlannerState } from "@/lib/planner/types"

/**
 * Self-heal: when offerings catch up after a unit was added (search
 * results don't pre-load offerings, so FY detection fires *after*
 * placement), promote half-placed FY units to twinned placement.
 *
 * Runs whenever the years or offerings map changes — but only one fix-up
 * is dispatched per render to avoid cascading state writes.
 */
export function useFullYearSelfHeal({
  state,
  offeringsMap,
  plannedCodes,
  dispatch,
}: {
  state: PlannerState
  offeringsMap: Map<string, PlannerOffering[]>
  plannedCodes: ReadonlySet<string>
  dispatch: React.Dispatch<PlannerAction>
}): void {
  useEffect(() => {
    for (let yi = 0; yi < state.years.length; yi++) {
      const year = state.years[yi]
      if (!year) continue
      const s1 = year.slots.find((s) => s.kind === "S1")
      const s2 = year.slots.find((s) => s.kind === "S2")
      if (!s1 || !s2) continue
      // heal leaves a year with a leave or exchange half alone, so skip
      // it here too, or the early return below would stall on it.
      if (s1.status || s2.status) continue
      const seen = new Set<string>()
      for (const code of [...s1.unitCodes, ...s2.unitCodes]) {
        if (seen.has(code)) continue
        seen.add(code)
        if (!isFullYearUnit(code, offeringsMap)) continue
        const inS1 = s1.unitCodes.includes(code)
        const inS2 = s2.unitCodes.includes(code)
        if (inS1 && inS2) continue
        // Half-placed FY unit: place it in both halves of this year.
        const others: string[] = []
        for (const c of plannedCodes)
          if (c !== code && isFullYearUnit(c, offeringsMap)) others.push(c)
        dispatch({
          type: "heal_full_year_unit",
          yearIndex: yi,
          code,
          fullYearCodes: others,
        })
        return
      }
    }
  }, [state.years, offeringsMap, plannedCodes, dispatch])
}
