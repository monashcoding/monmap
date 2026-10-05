"use client"

import { useEffect, useRef, useTransition } from "react"
import { toast } from "sonner"

import { fetchUnitsByYear, isAbortError } from "@/lib/api/client"
import { codesToHydrate, emptyKey } from "@/lib/planner/hydration"
import type { PlannerState } from "@/lib/planner/types"
import type { UnitBundle, UnitMaps } from "@/lib/planner/unit-cache"

interface Params {
  state: PlannerState
  availableYears: string[]
  unitData: UnitMaps
  /** Merge fetched data; `fillEmpty` codes get empty lists. */
  mergeUnitData: (bundle: UnitBundle, fillEmpty?: readonly string[]) => void
}

/**
 * Keep unit data hydrated for every code placed in the plan. Re-fetches
 * codes that are missing OR cached from the wrong handbook year (stale).
 * Each code is processed at its first study-year occurrence; this is
 * what lets year-N units pull from year-N handbook offerings instead of
 * year-0's. See `codesToHydrate` for the rule.
 *
 * Two cases would otherwise refetch on every render: a unit the server
 * returns from an earlier year (`fallbackFor`, counted as fresh) and a
 * code with no row at all. The second is remembered per (year, code)
 * in `emptyRef` and not requested again.
 *
 * A re-run aborts the request in flight and asks again for the codes
 * that are still missing.
 */
export function useUnitDataHydration({
  state,
  availableYears,
  unitData,
  mergeUnitData,
}: Params): void {
  const [, startTransition] = useTransition()

  const emptyRef = useRef(new Set<string>())

  useEffect(() => {
    const codesByYear = codesToHydrate({
      state: {
        years: state.years,
        credit: state.credit,
        courseYear: state.courseYear,
      },
      availableYears,
      units: unitData.units,
      offerings: unitData.offerings,
      requisites: unitData.requisites,
      empty: emptyRef.current,
    })

    if (codesByYear.size === 0) return

    const controller = new AbortController()
    startTransition(async () => {
      try {
        const res = await fetchUnitsByYear(codesByYear, controller.signal)
        if (controller.signal.aborted) return
        for (const [year, codes] of codesByYear)
          for (const code of codes)
            if (!res.units[code]) emptyRef.current.add(emptyKey(year, code))
        mergeUnitData(res, [...codesByYear.values()].flat())
      } catch (err) {
        if (isAbortError(err)) return
        toast.error("Couldn't load unit details", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
      }
    })
    return () => controller.abort()
  }, [
    state.years,
    state.credit,
    state.courseYear,
    unitData,
    availableYears,
    mergeUnitData,
  ])
}
