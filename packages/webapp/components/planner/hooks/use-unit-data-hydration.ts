"use client"

import { useEffect, useTransition } from "react"
import { toast } from "sonner"

import { hydrateUnitsMultiYearAction } from "@/app/actions"
import { handbookYearFor } from "@/lib/planner/local-storage"
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
 * year-0's.
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

  useEffect(() => {
    const codesByYear = new Map<string, string[]>()
    const seen = new Set<string>()

    for (let yi = 0; yi < state.years.length; yi++) {
      const hYear = handbookYearFor(yi, state.courseYear, availableYears)
      for (const slot of state.years[yi]?.slots ?? []) {
        for (const code of slot.unitCodes) {
          if (seen.has(code)) continue
          seen.add(code)
          const cached = unitsMap.get(code)
          const correct =
            cached?.year === hYear &&
            offeringsMap.has(code) &&
            requisitesMap.has(code)
          if (correct) continue
          const list = codesByYear.get(hYear) ?? []
          list.push(code)
          codesByYear.set(hYear, list)
        }
      }
    }

    if (codesByYear.size === 0) return
    const allNeeded = [...codesByYear.values()].flat()

    startTransition(async () => {
      try {
        const res = await hydrateUnitsMultiYearAction(
          Object.fromEntries(codesByYear)
        )
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
