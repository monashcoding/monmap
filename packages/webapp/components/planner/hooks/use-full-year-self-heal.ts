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
      const seen = new Set<string>()
      for (const code of [...s1.unitCodes, ...s2.unitCodes]) {
        if (seen.has(code)) continue
        seen.add(code)
        if (!isFullYearUnit(code, offeringsMap)) continue
        const inS1 = s1.unitCodes.includes(code)
        const inS2 = s2.unitCodes.includes(code)
        if (inS1 && inS2) continue
        // Half-placed FY unit — strip and re-add as proper twin.
        dispatch({ type: "remove_full_year_unit", code })
        // Compute fullYearCodes excluding the unit we just stripped.
        const others: string[] = []
        for (const c of plannedCodes)
          if (c !== code && isFullYearUnit(c, offeringsMap)) others.push(c)
        dispatch({
          type: "add_full_year_unit",
          yearIndex: yi,
          code,
          fullYearCodes: others,
        })
        return
      }
    }
  }, [state.years, offeringsMap, plannedCodes, dispatch])
}
