"use client"

import { useEffect, useRef, useTransition } from "react"
import { toast } from "sonner"

import { hydrateUnitsMultiYearAction } from "@/app/actions"
import { codesToHydrate, emptyKey } from "@/lib/planner/hydration"
import type {
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"

interface Params {
  state: PlannerState
  availableYears: string[]
  unitsMap: Map<string, PlannerUnit>
  offeringsMap: Map<string, PlannerOffering[]>
  requisitesMap: Map<string, RequisiteBlock[]>
  setUnits: React.Dispatch<React.SetStateAction<Map<string, PlannerUnit>>>
  setOfferings: React.Dispatch<
    React.SetStateAction<Map<string, PlannerOffering[]>>
  >
  setRequisites: React.Dispatch<
    React.SetStateAction<Map<string, RequisiteBlock[]>>
  >
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
 * Returns `isSyncing` so callers can render a non-blocking progress hint
 * while the background refetch is in flight.
 */
export function useUnitDataHydration({
  state,
  availableYears,
  unitsMap,
  offeringsMap,
  requisitesMap,
  setUnits,
  setOfferings,
  setRequisites,
}: Params): { isSyncing: boolean } {
  const [isSyncing, startTransition] = useTransition()

  const emptyRef = useRef(new Set<string>())

  useEffect(() => {
    const codesByYear = codesToHydrate({
      state: {
        years: state.years,
        credit: state.credit,
        courseYear: state.courseYear,
      },
      availableYears,
      units: unitsMap,
      offerings: offeringsMap,
      requisites: requisitesMap,
      empty: emptyRef.current,
    })

    if (codesByYear.size === 0) return
    const allNeeded = [...codesByYear.values()].flat()

    startTransition(async () => {
      try {
        const res = await hydrateUnitsMultiYearAction(
          Object.fromEntries(codesByYear)
        )
        for (const [year, codes] of codesByYear)
          for (const code of codes)
            if (!res.units[code]) emptyRef.current.add(emptyKey(year, code))
        setUnits((m) => {
          const next = new Map(m)
          for (const [k, v] of Object.entries(res.units)) next.set(k, v)
          return next
        })
        setOfferings((m) => {
          const next = new Map(m)
          for (const [k, v] of Object.entries(res.offerings)) next.set(k, v)
          for (const code of allNeeded) if (!next.has(code)) next.set(code, [])
          return next
        })
        setRequisites((m) => {
          const next = new Map(m)
          for (const [k, v] of Object.entries(res.requisites)) next.set(k, v)
          for (const code of allNeeded) if (!next.has(code)) next.set(code, [])
          return next
        })
      } catch (err) {
        toast.error("Couldn't load unit details", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
      }
    })
  }, [
    state.years,
    state.credit,
    state.courseYear,
    unitsMap,
    offeringsMap,
    requisitesMap,
    availableYears,
    setUnits,
    setOfferings,
    setRequisites,
  ])

  return { isSyncing }
}
