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
 * A re-run leaves requests in flight alone and asks only for codes no
 * request is fetching yet, so a merge that lands mid-request (a year
 * load, a unit added from search) doesn't throw a nearly finished
 * answer away. Requests are aborted only when the plan's handbook year
 * changes or the planner unmounts.
 */
export function useUnitDataHydration({
  state,
  availableYears,
  unitData,
  mergeUnitData,
}: Params): void {
  const [, startTransition] = useTransition()

  const emptyRef = useRef(new Set<string>())
  // emptyKey(year, code) for every code a request is fetching, and the
  // requests' controllers.
  const inFlightRef = useRef(new Set<string>())
  const controllersRef = useRef(new Set<AbortController>())

  // React runs this cleanup before the fetch effect re-runs, so on a
  // year change the old year's requests stop before new ones start.
  useEffect(() => {
    const inFlight = inFlightRef.current
    const controllers = controllersRef.current
    return () => {
      for (const c of controllers) c.abort()
      controllers.clear()
      inFlight.clear()
    }
  }, [state.courseYear])

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

    const inFlight = inFlightRef.current
    const wanted = new Map<string, string[]>()
    for (const [year, codes] of codesByYear) {
      const rest = codes.filter((c) => !inFlight.has(emptyKey(year, c)))
      if (rest.length > 0) wanted.set(year, rest)
    }
    if (wanted.size === 0) return

    const keys = [...wanted].flatMap(([year, codes]) =>
      codes.map((c) => emptyKey(year, c))
    )
    for (const k of keys) inFlight.add(k)
    const controller = new AbortController()
    controllersRef.current.add(controller)
    startTransition(async () => {
      try {
        const res = await fetchUnitsByYear(wanted, controller.signal)
        if (controller.signal.aborted) return
        for (const [year, codes] of wanted)
          for (const code of codes)
            if (!res.units[code]) emptyRef.current.add(emptyKey(year, code))
        mergeUnitData(res, [...wanted.values()].flat())
      } catch (err) {
        if (isAbortError(err)) return
        toast.error("Couldn't load unit details", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
      } finally {
        // An aborted request's keys were cleared with it, and a newer
        // request may hold the same keys now.
        if (!controller.signal.aborted) {
          controllersRef.current.delete(controller)
          for (const k of keys) inFlight.delete(k)
        }
      }
    })
  }, [
    state.years,
    state.credit,
    state.courseYear,
    unitData,
    availableYears,
    mergeUnitData,
  ])
}
