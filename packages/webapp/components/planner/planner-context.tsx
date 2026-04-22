"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { hydrateUnitsAction, loadCourseAction } from "@/app/actions"
import { distribute } from "@/lib/planner/distribute"
import { plannedUnitCodes } from "@/lib/planner/progress"
import {
  defaultState,
  plannerReducer,
  type PlannerAction,
} from "@/lib/planner/state"
import type {
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
  SlotUnitValidation,
} from "@/lib/planner/types"
import { validatePlan } from "@/lib/planner/validation"

const STORAGE_KEY = "monmap.plan.v1"

interface Hydrated {
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
}

export interface PlannerContextValue {
  state: PlannerState
  dispatch: (action: PlannerAction) => void

  courses: PlannerCourse[]
  course: PlannerCourseWithAoS | null

  units: Map<string, PlannerUnit>
  offerings: Map<string, PlannerOffering[]>
  requisites: Map<string, RequisiteBlock[]>

  /** Per-unit-in-slot validation keyed by `${year}:${slot}:${code}`. */
  validations: Map<string, SlotUnitValidation>
  /** Codes currently placed anywhere in the plan. */
  plannedCodes: Set<string>
  /** True while a server call is in flight — lets UI show non-blocking progress. */
  isSyncing: boolean

  /** Merge additional unit data (from search results) into the local cache. */
  mergeUnits: (units: PlannerUnit[]) => void
  /** Load and set a new course by code. */
  switchCourse: (code: string) => Promise<void>
  /**
   * Hydrate the given codes and place them onto the plan via the
   * distribution algorithm. `mode: "merge"` (default) appends; codes
   * already on the plan are skipped. `mode: "replace"` first clears
   * every slot.
   */
  loadUnitsTemplate: (
    codes: readonly string[],
    opts?: { mode?: "merge" | "replace"; label?: string }
  ) => Promise<void>

  /**
   * Monotonic counter bumped each time the user asks "validate" —
   * error unit cards watch this to run a brief pulse animation. Using
   * a counter rather than a boolean lets the effect re-fire even if
   * the count would otherwise be unchanged.
   */
  flashVersion: number
  flashErrors: () => void
}

const PlannerCtx = createContext<PlannerContextValue | null>(null)

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerCtx)
  if (!ctx) throw new Error("usePlanner must be used inside <PlannerProvider>")
  return ctx
}

export function PlannerProvider({
  children,
  courses,
  defaultCourse,
  prewarmed,
}: {
  children: React.ReactNode
  courses: PlannerCourse[]
  defaultCourse: PlannerCourseWithAoS | null
  prewarmed: Hydrated
}) {
  const [state, dispatch] = useReducer(
    plannerReducer,
    defaultState("2026", defaultCourse?.code ?? null, 3)
  )

  const [course, setCourse] = useState<PlannerCourseWithAoS | null>(
    defaultCourse
  )

  const [unitsMap, setUnitsMap] = useState<Map<string, PlannerUnit>>(
    () => new Map(Object.entries(prewarmed.units))
  )
  const [offeringsMap, setOfferingsMap] = useState<
    Map<string, PlannerOffering[]>
  >(() => new Map(Object.entries(prewarmed.offerings)))
  const [requisitesMap, setRequisitesMap] = useState<
    Map<string, RequisiteBlock[]>
  >(() => new Map(Object.entries(prewarmed.requisites)))

  const [isSyncing, startTransition] = useTransition()

  const [flashVersion, setFlashVersion] = useState(0)
  const flashErrors = useCallback(() => {
    setFlashVersion((n) => n + 1)
    // Scroll the first errored card into view so the pulse is never
    // off-screen. Runs in the next tick so the DOM has had time to
    // reflect the current validation pass.
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>(
        '[data-validation-status="error"]'
      )
      if (first) {
        first.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    })
  }, [])

  // Rehydrate from localStorage exactly once on mount. We do this in
  // an effect (not initial reducer state) so SSR and the first client
  // render agree — otherwise hydration diffs.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as PlannerState
      if (parsed && Array.isArray(parsed.years)) {
        dispatch({ type: "hydrate", state: parsed })
        // If the restored plan has a different course from the default,
        // load it.
        if (parsed.courseCode && parsed.courseCode !== defaultCourse?.code) {
          void (async () => {
            const c = await loadCourseAction(parsed.courseCode!)
            setCourse(c)
          })()
        }
      }
    } catch {
      // Ignore — corrupt localStorage is a user problem, not a crash.
    }
  }, [defaultCourse?.code])

  // Persist plan state on every change (minus the very first render,
  // which would just round-trip the default).
  const firstPersistRef = useRef(true)
  useEffect(() => {
    if (firstPersistRef.current) {
      firstPersistRef.current = false
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Quota / private mode — silently drop.
    }
  }, [state])

  // Keep unit data hydrated for every code placed in the plan.
  // Whenever a new code shows up, fetch the missing bundle in a transition.
  const plannedCodes = useMemo(() => plannedUnitCodes(state), [state])
  useEffect(() => {
    const needed = [...plannedCodes].filter(
      (c) => !unitsMap.has(c) || !offeringsMap.has(c) || !requisitesMap.has(c)
    )
    if (needed.length === 0) return
    startTransition(async () => {
      try {
        const res = await hydrateUnitsAction(needed)
        setUnitsMap((m) => {
          const next = new Map(m)
          for (const [k, v] of Object.entries(res.units)) next.set(k, v)
          return next
        })
        setOfferingsMap((m) => {
          const next = new Map(m)
          for (const [k, v] of Object.entries(res.offerings)) next.set(k, v)
          // For units that have no offering rows, still set an empty
          // array so we don't re-fetch them.
          for (const code of needed) if (!next.has(code)) next.set(code, [])
          return next
        })
        setRequisitesMap((m) => {
          const next = new Map(m)
          for (const [k, v] of Object.entries(res.requisites)) next.set(k, v)
          for (const code of needed) if (!next.has(code)) next.set(code, [])
          return next
        })
      } catch (err) {
        toast.error("Couldn't load unit details", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
      }
    })
  }, [plannedCodes, unitsMap, offeringsMap, requisitesMap])

  const validations = useMemo(
    () => validatePlan(state, unitsMap, offeringsMap, requisitesMap),
    [state, unitsMap, offeringsMap, requisitesMap]
  )

  const mergeUnits = useCallback((list: PlannerUnit[]) => {
    setUnitsMap((m) => {
      const next = new Map(m)
      for (const u of list) next.set(u.code, u)
      return next
    })
  }, [])

  const loadUnitsTemplate = useCallback(
    async (
      codes: readonly string[],
      opts?: { mode?: "merge" | "replace"; label?: string }
    ) => {
      const mode = opts?.mode ?? "merge"
      const label = opts?.label ?? "template"
      const unique = [...new Set(codes)]
      if (unique.length === 0) {
        toast.info(`No units to load from ${label}.`)
        return
      }
      startTransition(async () => {
        try {
          const res = await hydrateUnitsAction(unique)
          const nextUnits = new Map(unitsMap)
          for (const [k, v] of Object.entries(res.units)) nextUnits.set(k, v)
          const nextOff = new Map(offeringsMap)
          for (const [k, v] of Object.entries(res.offerings)) nextOff.set(k, v)
          for (const code of unique)
            if (!nextOff.has(code)) nextOff.set(code, [])
          setUnitsMap(nextUnits)
          setOfferingsMap(nextOff)
          setRequisitesMap((m) => {
            const n = new Map(m)
            for (const [k, v] of Object.entries(res.requisites)) n.set(k, v)
            for (const code of unique) if (!n.has(code)) n.set(code, [])
            return n
          })
          const { placements, skipped } = distribute({
            codes: unique,
            units: nextUnits,
            offerings: nextOff,
            state,
          })
          dispatch({ type: "bulk_load", placements, mode })
          const placedMsg = `${placements.length} unit${placements.length === 1 ? "" : "s"} added`
          const skippedMsg =
            skipped.length > 0 ? ` (${skipped.length} already on plan)` : ""
          toast.success(`${label}: ${placedMsg}${skippedMsg}`)
        } catch (err) {
          toast.error(`Couldn't load ${label}`, {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    },
    [state, unitsMap, offeringsMap]
  )

  const switchCourse = useCallback(async (code: string) => {
    startTransition(async () => {
      try {
        const c = await loadCourseAction(code)
        setCourse(c)
        dispatch({ type: "set_course", code })
        // Merge any new AoS units into the local cache so the
        // requirements panel renders titles without a second round-trip.
        if (c) {
          const codes = [
            ...new Set([
              ...c.areasOfStudy.flatMap((a) => a.units.map((u) => u.code)),
              ...c.courseUnits.map((u) => u.code),
            ]),
          ]
          const res = await hydrateUnitsAction(codes)
          setUnitsMap((m) => {
            const next = new Map(m)
            for (const [k, v] of Object.entries(res.units)) next.set(k, v)
            return next
          })
          setOfferingsMap((m) => {
            const next = new Map(m)
            for (const [k, v] of Object.entries(res.offerings)) next.set(k, v)
            return next
          })
          setRequisitesMap((m) => {
            const next = new Map(m)
            for (const [k, v] of Object.entries(res.requisites)) next.set(k, v)
            return next
          })
        }
      } catch (err) {
        toast.error("Couldn't load course", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
      }
    })
  }, [])

  const value: PlannerContextValue = {
    state,
    dispatch,
    courses,
    course,
    units: unitsMap,
    offerings: offeringsMap,
    requisites: requisitesMap,
    validations,
    plannedCodes,
    isSyncing,
    mergeUnits,
    switchCourse,
    loadUnitsTemplate,
    flashVersion,
    flashErrors,
  }

  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>
}
