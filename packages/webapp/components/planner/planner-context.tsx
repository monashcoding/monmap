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

import {
  hydrateUnitsAction,
  listCoursesAction,
  loadCourseAction,
} from "@/app/actions"
import { distribute } from "@/lib/planner/distribute"
import { isFullYearUnit } from "@/lib/planner/full-year"
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
  /** Years that actually exist in the database. */
  availableYears: string[]

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
  /** True if a code is a full-year unit per current offerings data. */
  isFullYear: (code: string) => boolean
  /** All FY codes currently placed anywhere in the plan. */
  fullYearCodes: string[]
  /** Add a unit, automatically routing FY units to S1[0]+S2[0] of the year. */
  addUnit: (yearIndex: number, slotIndex: number, code: string) => void
  /** Remove a unit, stripping both halves if FY. */
  removeUnit: (yearIndex: number, slotIndex: number, code: string) => void
  /** Load and set a new course by code. */
  switchCourse: (code: string) => Promise<void>
  /** Switch the handbook year — refetches course, picker list, and unit data. */
  switchYear: (year: string) => Promise<void>
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
  initialYear,
  availableYears,
  courses: initialCourses,
  defaultCourse,
  prewarmed,
}: {
  children: React.ReactNode
  initialYear: string
  availableYears: string[]
  courses: PlannerCourse[]
  defaultCourse: PlannerCourseWithAoS | null
  prewarmed: Hydrated
}) {
  const [state, dispatch] = useReducer(
    plannerReducer,
    defaultState(initialYear, defaultCourse?.code ?? null, 3)
  )

  const [course, setCourse] = useState<PlannerCourseWithAoS | null>(
    defaultCourse
  )
  const [courses, setCourses] = useState<PlannerCourse[]>(initialCourses)

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
      if (!parsed || !Array.isArray(parsed.years)) return

      // The saved year may not exist in the DB anymore (e.g. old data
      // got trimmed). Fall back to the server-provided initial year.
      const savedYear =
        parsed.courseYear && availableYears.includes(parsed.courseYear)
          ? parsed.courseYear
          : initialYear
      const merged: PlannerState = { ...parsed, courseYear: savedYear }
      dispatch({ type: "hydrate", state: merged })

      const yearChanged = savedYear !== initialYear
      const codeChanged =
        (parsed.courseCode ?? null) !== (defaultCourse?.code ?? null)
      // If the saved year/course differs from what the server prewarmed,
      // refetch everything against the saved year.
      if (yearChanged || codeChanged) {
        void (async () => {
          if (yearChanged) {
            const list = await listCoursesAction(null, savedYear)
            setCourses(list)
          }
          const c = parsed.courseCode
            ? await loadCourseAction(parsed.courseCode, savedYear)
            : null
          setCourse(c)
          if (c) {
            const codes = [
              ...new Set([
                ...c.areasOfStudy.flatMap((a) => a.units.map((u) => u.code)),
                ...c.courseUnits.map((u) => u.code),
              ]),
            ]
            const res = await hydrateUnitsAction(codes, savedYear)
            setUnitsMap(new Map(Object.entries(res.units)))
            setOfferingsMap(new Map(Object.entries(res.offerings)))
            setRequisitesMap(new Map(Object.entries(res.requisites)))
          }
        })()
      }
    } catch {
      // Ignore — corrupt localStorage is a user problem, not a crash.
    }
  }, [defaultCourse?.code, initialYear, availableYears])

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
    const yearForFetch = state.courseYear
    startTransition(async () => {
      try {
        const res = await hydrateUnitsAction(needed, yearForFetch)
        setUnitsMap((m) => {
          const next = new Map(m)
          for (const [k, v] of Object.entries(res.units)) next.set(k, v)
          return next
        })
        setOfferingsMap((m) => {
          const next = new Map(m)
          for (const [k, v] of Object.entries(res.offerings)) next.set(k, v)
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
  }, [plannedCodes, unitsMap, offeringsMap, requisitesMap, state.courseYear])

  const validations = useMemo(
    () => validatePlan(state, unitsMap, offeringsMap, requisitesMap),
    [state, unitsMap, offeringsMap, requisitesMap]
  )

  // Self-heal: when offerings catch up after a unit was added (search
  // results don't pre-load offerings, so FY detection fires *after*
  // placement), promote half-placed FY units to twinned placement.
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
  }, [state.years, offeringsMap, plannedCodes])

  const mergeUnits = useCallback((list: PlannerUnit[]) => {
    setUnitsMap((m) => {
      const next = new Map(m)
      for (const u of list) next.set(u.code, u)
      return next
    })
  }, [])

  const isFullYear = useCallback(
    (code: string) => isFullYearUnit(code, offeringsMap),
    [offeringsMap]
  )

  const fullYearCodes = useMemo(() => {
    const out = new Set<string>()
    for (const c of plannedCodes)
      if (isFullYearUnit(c, offeringsMap)) out.add(c)
    return [...out]
  }, [plannedCodes, offeringsMap])

  const addUnit = useCallback(
    (yearIndex: number, slotIndex: number, code: string) => {
      if (isFullYearUnit(code, offeringsMap)) {
        dispatch({
          type: "add_full_year_unit",
          yearIndex,
          code,
          fullYearCodes,
        })
      } else {
        dispatch({ type: "add_unit", yearIndex, slotIndex, code })
      }
    },
    [offeringsMap, fullYearCodes]
  )

  const removeUnit = useCallback(
    (yearIndex: number, slotIndex: number, code: string) => {
      if (isFullYearUnit(code, offeringsMap)) {
        dispatch({ type: "remove_full_year_unit", code })
      } else {
        dispatch({ type: "remove_unit", yearIndex, slotIndex, code })
      }
    },
    [offeringsMap]
  )

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
          const res = await hydrateUnitsAction(unique, state.courseYear)
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

  const switchCourse = useCallback(
    async (code: string) => {
      const yearForFetch = state.courseYear
      startTransition(async () => {
        try {
          const c = await loadCourseAction(code, yearForFetch)
          setCourse(c)
          dispatch({ type: "set_course", code })
          if (c) {
            const codes = [
              ...new Set([
                ...c.areasOfStudy.flatMap((a) => a.units.map((u) => u.code)),
                ...c.courseUnits.map((u) => u.code),
              ]),
            ]
            const res = await hydrateUnitsAction(codes, yearForFetch)
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
              for (const [k, v] of Object.entries(res.requisites))
                next.set(k, v)
              return next
            })
          }
        } catch (err) {
          toast.error("Couldn't load course", {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    },
    [state.courseYear]
  )

  const switchYear = useCallback(
    async (year: string) => {
      if (year === state.courseYear) return
      startTransition(async () => {
        try {
          dispatch({ type: "set_year", year })
          // Refetch the courses list so the picker reflects the year.
          const list = await listCoursesAction(null, year)
          setCourses(list)
          // Refetch the currently-selected course (if any) against the
          // new year. The course may not exist there — surface that as
          // a null course and let the UI prompt for a new pick.
          const code = state.courseCode
          const c = code ? await loadCourseAction(code, year) : null
          setCourse(c)
          if (c) {
            const codes = [
              ...new Set([
                ...c.areasOfStudy.flatMap((a) => a.units.map((u) => u.code)),
                ...c.courseUnits.map((u) => u.code),
              ]),
            ]
            const res = await hydrateUnitsAction(codes, year)
            // Replace, don't merge — old year's offerings/requisites are
            // stale and would mis-validate against the new year.
            setUnitsMap(new Map(Object.entries(res.units)))
            setOfferingsMap(new Map(Object.entries(res.offerings)))
            setRequisitesMap(new Map(Object.entries(res.requisites)))
          } else {
            setUnitsMap(new Map())
            setOfferingsMap(new Map())
            setRequisitesMap(new Map())
            if (code) {
              toast.warning(`${code} isn't in the ${year} handbook`, {
                description:
                  "Pick another course or switch back to a year that has it.",
              })
            }
          }
        } catch (err) {
          toast.error("Couldn't switch year", {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    },
    [state.courseYear, state.courseCode]
  )

  const value: PlannerContextValue = {
    state,
    dispatch,
    courses,
    course,
    availableYears,
    units: unitsMap,
    offerings: offeringsMap,
    requisites: requisitesMap,
    validations,
    plannedCodes,
    isSyncing,
    mergeUnits,
    isFullYear,
    fullYearCodes,
    addUnit,
    removeUnit,
    switchCourse,
    switchYear,
    loadUnitsTemplate,
    flashVersion,
    flashErrors,
  }

  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>
}
