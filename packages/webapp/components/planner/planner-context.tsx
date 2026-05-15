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
  createMyPlanAction,
  deleteMyPlanAction,
  getMyPlanAction,
  hydrateUnitsAction,
  listCoursesAction,
  listMyPlansAction,
  loadCourseAction,
  renameMyPlanAction,
  saveMyPlanAction,
} from "@/app/actions"
import type { PlanSummary } from "@/lib/db/queries"
import { distribute } from "@/lib/planner/distribute"
import { isFullYearUnit } from "@/lib/planner/full-year"
import {
  clearLocalPlan,
  readLocalPlan,
  writeLocalPlan,
} from "@/lib/planner/local-storage"
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

import { useFullYearSelfHeal } from "./hooks/use-full-year-self-heal"
import { useUnitDataHydration } from "./hooks/use-unit-data-hydration"

/** ms to wait after the last edit before pushing a save to the server. */
const SERVER_SAVE_DEBOUNCE = 800

export interface PlannerCurrentUser {
  id: string
  name: string
  email: string
  image: string | null
}

interface Hydrated {
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
}

export interface PlannerContextValue {
  state: PlannerState
  dispatch: (action: PlannerAction) => void

  /** Authenticated user info, or null for anonymous visitors. */
  currentUser: PlannerCurrentUser | null
  /**
   * Whether the current edit has been persisted yet:
   *   - "saved"   → in sync with the persistence backend
   *   - "saving"  → mutation in flight (signed-in only)
   *   - "local"   → anonymous; held only in localStorage on this device
   *   - "error"   → last server save failed; will retry on next change
   */
  saveStatus: "saved" | "saving" | "local" | "error"

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

  /* ---------- Multi-plan (signed-in only; empty for anon) ---------- */
  /** All plans the signed-in user owns, most recent first. */
  plans: PlanSummary[]
  /** Plan id whose state is currently in `state`. Null while anon, or
   * while a brand-new signed-in user hasn't saved their first plan. */
  activePlanId: string | null
  /** Switch to a different saved plan, flushing any pending save first. */
  switchPlan: (planId: string) => Promise<void>
  /** Create a fresh plan and switch to it. `fromCurrent` copies the
   * current planner state; otherwise the new plan starts empty. */
  createPlan: (name: string, opts?: { fromCurrent?: boolean }) => Promise<void>
  /** Rename one of the user's plans. */
  renamePlan: (planId: string, name: string) => Promise<void>
  /** Delete a plan. If it was the active one we switch to whatever
   * plan is most recent, or fall back to a fresh empty plan. */
  deletePlan: (planId: string) => Promise<void>
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
  currentUser,
  initialPlan,
  initialPlans,
  initialActivePlanId,
}: {
  children: React.ReactNode
  initialYear: string
  availableYears: string[]
  courses: PlannerCourse[]
  defaultCourse: PlannerCourseWithAoS | null
  prewarmed: Hydrated
  currentUser: PlannerCurrentUser | null
  /**
   * Pre-fetched plan state for signed-in users (the active one); null
   * when anonymous or when the user has no saved plans yet.
   */
  initialPlan: PlannerState | null
  /** Pre-fetched plan summaries for the user; empty for anon. */
  initialPlans: PlanSummary[]
  /** Pre-selected plan id (whose state is `initialPlan`); null when anon
   * or signed-in-with-no-plans. */
  initialActivePlanId: string | null
}) {
  const [state, dispatch] = useReducer(
    plannerReducer,
    defaultState(initialYear, defaultCourse?.code ?? null, 3)
  )

  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "local" | "error"
  >(currentUser ? "saved" : "local")

  const [plans, setPlans] = useState<PlanSummary[]>(initialPlans)
  const [activePlanId, setActivePlanId] = useState<string | null>(
    initialActivePlanId
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

  const [, startCourseTransition] = useTransition()

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

  // Rehydrate the plan exactly once on mount. Source of truth depends
  // on auth state:
  //
  //   signed-in + initialPlan present  → server (passed as prop)
  //   signed-in + no server plan       → localStorage migration: if a
  //                                      pre-auth plan exists locally,
  //                                      hydrate from it AND push to
  //                                      the server, then clear local
  //   anonymous                        → localStorage as before
  //
  // The reason we run this in an effect (not as the initial reducer
  // value) is to keep the SSR and the first client render byte-identical
  // — hydrating mid-render would diff.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    let plan: PlannerState | null = null
    let didMigrateLocal = false

    if (currentUser) {
      if (initialPlan) {
        plan = initialPlan
      } else {
        const local = readLocalPlan()
        if (local) {
          plan = local
          didMigrateLocal = true
        }
      }
    } else {
      plan = readLocalPlan()
    }

    if (!plan) return

    // The saved year may not exist in the DB anymore (e.g. old data
    // got trimmed). Fall back to the server-provided initial year.
    const savedYear =
      plan.courseYear && availableYears.includes(plan.courseYear)
        ? plan.courseYear
        : initialYear
    const merged: PlannerState = { ...plan, courseYear: savedYear }
    dispatch({ type: "hydrate", state: merged })

    if (didMigrateLocal && currentUser) {
      // Push the migrated plan to the server as a new named plan, then
      // clear localStorage so future logouts don't surface a stale
      // copy. The created plan becomes the active one.
      void createMyPlanAction("My plan", merged).then((res) => {
        if (res.ok) {
          clearLocalPlan()
          setActivePlanId(res.plan.id)
          setPlans((prev) => [
            { id: res.plan.id, name: res.plan.name, updatedAt: new Date() },
            ...prev,
          ])
          toast.success("Your plan is now saved to your account")
        }
      })
    }

    const yearChanged = savedYear !== initialYear
    const codeChanged =
      (plan.courseCode ?? null) !== (defaultCourse?.code ?? null)
    // If the saved year/course differs from what the server prewarmed,
    // refetch everything against the saved year.
    if (yearChanged || codeChanged) {
      const planCourseCode = plan.courseCode
      void (async () => {
        if (yearChanged) {
          const list = await listCoursesAction(null, savedYear)
          setCourses(list)
        }
        const c = planCourseCode
          ? await loadCourseAction(planCourseCode, savedYear)
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
  }, [
    currentUser,
    initialPlan,
    defaultCourse?.code,
    initialYear,
    availableYears,
  ])

  // Persist plan state on every change. Skip the very first render
  // (would just round-trip the default), then route based on auth:
  //   signed-in & has activePlanId → debounced server save
  //   signed-in & no activePlanId  → first edit creates "My plan",
  //                                  promotes it to active
  //   anonymous                     → localStorage write
  //
  // We mirror activePlanId and the latest snapshot into refs so that
  // `switchPlan` can flush the in-flight save synchronously without
  // tripping over stale closure state.
  const firstPersistRef = useRef(true)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activePlanIdRef = useRef(activePlanId)
  const lastSnapshotRef = useRef(state)
  useEffect(() => {
    activePlanIdRef.current = activePlanId
  }, [activePlanId])
  useEffect(() => {
    lastSnapshotRef.current = state
  }, [state])

  const fallbackToLocal = useCallback(
    (snapshot: PlannerState, finalStatus: "local" = "local") => {
      writeLocalPlan(snapshot)
      setSaveStatus(finalStatus)
    },
    []
  )

  const handleSaveResult = useCallback(
    (
      res: Awaited<ReturnType<typeof saveMyPlanAction>>,
      snapshot: PlannerState
    ) => {
      if (res.ok) {
        setSaveStatus("saved")
        // Bump our local "most recently updated" snapshot for plan list
        // ordering. Cheap; avoids a refetch.
        const planId = activePlanIdRef.current
        if (planId) {
          setPlans((prev) =>
            [
              ...prev.map((p) =>
                p.id === planId ? { ...p, updatedAt: new Date() } : p
              ),
            ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          )
        }
      } else if (res.reason === "unauthenticated") {
        fallbackToLocal(snapshot)
      } else {
        setSaveStatus("error")
      }
    },
    [fallbackToLocal]
  )

  useEffect(() => {
    if (firstPersistRef.current) {
      firstPersistRef.current = false
      return
    }

    if (currentUser) {
      // Debounce: a drag emits many state updates; we only need to land
      // the final one within ~1s of the user pausing. Setting state in
      // the effect body is deliberate — every state change kicks off a
      // new persistence cycle and the user needs to see "saving…"
      // immediately, before the debounced server call fires.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaveStatus("saving")
      const snapshot = state
      saveTimerRef.current = setTimeout(() => {
        const planId = activePlanIdRef.current
        if (planId) {
          void saveMyPlanAction(planId, snapshot).then((res) => {
            handleSaveResult(res, snapshot)
          })
        } else {
          // First edit by a signed-in user with no plan yet. Promote
          // their work to a brand-new "My plan" record.
          void createMyPlanAction("My plan", snapshot).then((res) => {
            if (res.ok) {
              setActivePlanId(res.plan.id)
              setPlans((prev) => [
                {
                  id: res.plan.id,
                  name: res.plan.name,
                  updatedAt: new Date(),
                },
                ...prev,
              ])
              setSaveStatus("saved")
            } else if (res.reason === "unauthenticated") {
              fallbackToLocal(snapshot)
            } else {
              setSaveStatus("error")
            }
          })
        }
      }, SERVER_SAVE_DEBOUNCE)
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      }
    }

    // Anonymous: keep on this device.
    fallbackToLocal(state, "local")
  }, [state, currentUser, fallbackToLocal, handleSaveResult])

  const { isSyncing } = useUnitDataHydration({
    state,
    availableYears,
    unitsMap,
    offeringsMap,
    requisitesMap,
    setUnits: setUnitsMap,
    setOfferings: setOfferingsMap,
    setRequisites: setRequisitesMap,
  })

  const plannedCodes = useMemo(() => plannedUnitCodes(state), [state])

  const validations = useMemo(
    () => validatePlan(state, unitsMap, offeringsMap, requisitesMap),
    [state, unitsMap, offeringsMap, requisitesMap]
  )

  useFullYearSelfHeal({
    state,
    offeringsMap,
    plannedCodes,
    dispatch,
  })

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
      startCourseTransition(async () => {
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
      startCourseTransition(async () => {
        try {
          const c = await loadCourseAction(code, yearForFetch)
          setCourse(c)
          dispatch({ type: "set_course", code })
          if (c) {
            dispatch({
              type: "set_year_count",
              count: Math.max(1, Math.ceil(c.creditPoints / 48)),
            })
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
      startCourseTransition(async () => {
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

  /* ---------- Multi-plan operations ---------- */

  /**
   * Synchronously cancel any pending debounced save and fire it now,
   * so the in-progress edit lands against the *current* activePlanId
   * before we point activePlanId somewhere else.
   */
  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const planId = activePlanIdRef.current
    if (!currentUser || !planId) return
    setSaveStatus("saving")
    const snapshot = lastSnapshotRef.current
    const res = await saveMyPlanAction(planId, snapshot)
    setSaveStatus(res.ok ? "saved" : "error")
  }, [currentUser])

  /**
   * Hydrate the planner with a fetched plan: dispatch its state and
   * refetch course/year/unit data if the new plan disagrees with the
   * currently-rendered course or year. Identical structure to the
   * initial-mount hydration logic, factored out so plan-switching can
   * reuse it.
   */
  const hydrateFetchedPlan = useCallback(
    async (planState: PlannerState) => {
      const targetYear =
        planState.courseYear && availableYears.includes(planState.courseYear)
          ? planState.courseYear
          : initialYear
      const merged: PlannerState = { ...planState, courseYear: targetYear }
      dispatch({ type: "hydrate", state: merged })

      // Pause the persist effect from auto-saving the hydrated state;
      // the snapshot we just dispatched IS the canonical server state.
      firstPersistRef.current = true

      // Refetch course/picker/unit data tied to the new plan.
      startCourseTransition(async () => {
        try {
          const yearChanged = targetYear !== state.courseYear
          if (yearChanged) {
            const list = await listCoursesAction(null, targetYear)
            setCourses(list)
          }
          const c = planState.courseCode
            ? await loadCourseAction(planState.courseCode, targetYear)
            : null
          setCourse(c)
          if (c) {
            const codes = [
              ...new Set([
                ...c.areasOfStudy.flatMap((a) => a.units.map((u) => u.code)),
                ...c.courseUnits.map((u) => u.code),
              ]),
            ]
            const res = await hydrateUnitsAction(codes, targetYear)
            setUnitsMap(new Map(Object.entries(res.units)))
            setOfferingsMap(new Map(Object.entries(res.offerings)))
            setRequisitesMap(new Map(Object.entries(res.requisites)))
          } else {
            setUnitsMap(new Map())
            setOfferingsMap(new Map())
            setRequisitesMap(new Map())
          }
        } catch (err) {
          toast.error("Couldn't load the plan", {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    },
    [availableYears, initialYear, state.courseYear]
  )

  const switchPlan = useCallback(
    async (planId: string) => {
      if (!currentUser || planId === activePlanId) return
      await flushPendingSave()
      const fetched = await getMyPlanAction(planId)
      if (!fetched) {
        toast.error("That plan no longer exists")
        // Refresh the list so the missing plan disappears from the UI.
        const fresh = await listMyPlansAction()
        setPlans(fresh)
        return
      }
      setActivePlanId(planId)
      await hydrateFetchedPlan(fetched.state)
      setSaveStatus("saved")
    },
    [currentUser, activePlanId, flushPendingSave, hydrateFetchedPlan]
  )

  const createPlan = useCallback(
    async (name: string, opts?: { fromCurrent?: boolean }) => {
      if (!currentUser) return
      await flushPendingSave()
      const seedState = opts?.fromCurrent
        ? lastSnapshotRef.current
        : defaultState(initialYear, defaultCourse?.code ?? null, 3)
      const trimmed = name.trim() || "My plan"
      const res = await createMyPlanAction(trimmed, seedState)
      if (!res.ok) {
        toast.error("Couldn't create plan")
        return
      }
      setPlans((prev) => [
        { id: res.plan.id, name: res.plan.name, updatedAt: new Date() },
        ...prev,
      ])
      setActivePlanId(res.plan.id)
      // Hydrate so the editor reflects the new plan's seed state.
      await hydrateFetchedPlan(seedState)
      setSaveStatus("saved")
      toast.success(`Created “${res.plan.name}”`)
    },
    [
      currentUser,
      flushPendingSave,
      hydrateFetchedPlan,
      initialYear,
      defaultCourse?.code,
    ]
  )

  const renamePlan = useCallback(
    async (planId: string, name: string) => {
      if (!currentUser) return
      const trimmed = name.trim()
      if (!trimmed) return
      const res = await renameMyPlanAction(planId, trimmed)
      if (!res.ok) {
        toast.error("Couldn't rename plan")
        return
      }
      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId ? { ...p, name: trimmed, updatedAt: new Date() } : p
        )
      )
    },
    [currentUser]
  )

  const deletePlan = useCallback(
    async (planId: string) => {
      if (!currentUser) return
      const res = await deleteMyPlanAction(planId)
      if (!res.ok) {
        toast.error("Couldn't delete plan")
        return
      }
      const remaining = plans.filter((p) => p.id !== planId)
      setPlans(remaining)
      if (planId === activePlanId) {
        // Switch to the next-most-recent plan, or wipe to a fresh empty
        // plan if there are none.
        const next = remaining[0]
        if (next) {
          await switchPlan(next.id)
        } else {
          setActivePlanId(null)
          dispatch({
            type: "hydrate",
            state: defaultState(initialYear, defaultCourse?.code ?? null, 3),
          })
        }
      }
    },
    [
      currentUser,
      plans,
      activePlanId,
      switchPlan,
      initialYear,
      defaultCourse?.code,
    ]
  )

  // Memoize the context value so a fresh object identity is only
  // produced when one of the underlying state slices actually changes.
  // Every callback below is already wrapped in useCallback and every
  // derived collection is in useMemo, so the deps list here is the
  // complete set of identity-change sources.
  const value = useMemo<PlannerContextValue>(
    () => ({
      state,
      dispatch,
      currentUser,
      saveStatus,
      plans,
      activePlanId,
      switchPlan,
      createPlan,
      renamePlan,
      deletePlan,
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
    }),
    [
      state,
      currentUser,
      saveStatus,
      plans,
      activePlanId,
      switchPlan,
      createPlan,
      renamePlan,
      deletePlan,
      courses,
      course,
      availableYears,
      unitsMap,
      offeringsMap,
      requisitesMap,
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
    ]
  )

  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>
}
