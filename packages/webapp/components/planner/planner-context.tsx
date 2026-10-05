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
  listMyPlansAction,
  renameMyPlanAction,
  saveMyPlanAction,
  type SaveResult,
} from "@/app/actions"
import { capture } from "@/lib/analytics"
import { fetchPlannerYear, fetchUnits } from "@/lib/api/client"
import { MAX_PLANS_PER_USER } from "@/lib/db/input"
import type { PlanSummary } from "@/lib/db/queries"
import { pickedAosEntries, type PickedAosEntry } from "@/lib/planner/aos-slots"
import { availableCampuses, courseForCampus } from "@/lib/planner/campus"
import { coreUnitCodes } from "@/lib/planner/core-units"
import { distribute } from "@/lib/planner/distribute"
import { isFullYearUnit } from "@/lib/planner/full-year"
import {
  clearLocalPlan,
  readLocalPlan,
  writeLocalPlan,
} from "@/lib/planner/local-storage"
import {
  plannedUnitCodes,
  summarizePlan,
  type ProgressSummary,
} from "@/lib/planner/progress"
import {
  defaultState,
  historyReducer,
  initialHistory,
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
import { handbookYearFor, yearsNeeded } from "@/lib/planner/timeline"
import {
  keepUnitYears,
  mergeUnitMaps,
  unitBundleFor,
  unitMapsFrom,
  type UnitBundle,
  type UnitMaps,
} from "@/lib/planner/unit-cache"
import { validatePlan } from "@/lib/planner/validation"

import { useFullYearSelfHeal } from "./hooks/use-full-year-self-heal"
import { useUnitDataHydration } from "./hooks/use-unit-data-hydration"
import type { PlannerProps } from "./planner"

/** ms to wait after the last edit before pushing a save to the server. */
const SERVER_SAVE_DEBOUNCE = 800

const PLAN_LIMIT_MESSAGE = `You have reached the limit of ${MAX_PLANS_PER_USER} plans. Delete a plan to make a new one.`

type CreateResult = Awaited<ReturnType<typeof createMyPlanAction>>

/**
 * What the client knows about the signed-in user: the name for the
 * print sheet. Ids and emails stay on the server.
 */
export interface PlannerCurrentUser {
  name: string
}

/**
 * Whether the current edit has been persisted yet:
 *   - "saved"   → in sync with the persistence backend
 *   - "saving"  → mutation in flight (signed-in only)
 *   - "local"   → anonymous; held only in localStorage on this device
 *   - "error"   → last server save failed; will retry on next change
 */
export type SaveStatus = "saved" | "saving" | "local" | "error"

export interface PlannerContextValue {
  state: PlannerState
  dispatch: (action: PlannerAction) => void
  /** Roll the planner state back one step. No-op when no past entries. */
  undo: () => void
  /** Re-apply a previously undone step. No-op when no future entries. */
  redo: () => void
  canUndo: boolean
  canRedo: boolean

  /** Signed-in user, or null for anonymous visitors. */
  currentUser: PlannerCurrentUser | null

  courses: PlannerCourse[]
  course: PlannerCourseWithAoS | null
  /**
   * Campuses this course scopes anything by, read from the course
   * *before* it is narrowed. Deriving it from the narrowed course
   * instead is self-referential: picking Malaysia drops every
   * Clayton-scoped group, Clayton disappears from the vocabulary, and
   * the student can no longer switch back.
   */
  campuses: string[]
  /** Years that actually exist in the database. */
  availableYears: string[]

  units: Map<string, PlannerUnit>
  offerings: Map<string, PlannerOffering[]>
  requisites: Map<string, RequisiteBlock[]>

  /** Per-unit-in-slot validation keyed by `${year}:${slot}:${code}`. */
  validations: Map<string, SlotUnitValidation>
  /** Codes placed anywhere in the plan, plus credited codes. */
  plannedCodes: Set<string>
  /** Credit points and unit counts for the plan, computed once per change. */
  summary: ProgressSummary
  /** The student's areas of study, in slot order. */
  pickedAos: PickedAosEntry[]
  /** Units the course or a picked area of study requires. */
  coreCodes: ReadonlySet<string>

  /** Merge unit data (one unit picked from search, say) into the cache. */
  mergeUnitData: (bundle: UnitBundle) => void
  /** True if a code is a full-year unit per current offerings data. */
  isFullYear: (code: string) => boolean
  /** All FY codes currently placed anywhere in the plan. */
  fullYearCodes: string[]
  /**
   * Add a unit, automatically routing FY units to S1[0]+S2[0] of the
   * year. `offerings` overrides the planner's own for the full-year
   * check, for a unit whose offerings came from a search.
   */
  addUnit: (
    yearIndex: number,
    slotIndex: number,
    code: string,
    offerings?: ReadonlyMap<string, PlannerOffering[]>
  ) => void
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
  /** Pulse the error cards (see usePlannerFlash) and scroll to the first. */
  flashErrors: () => void
}

/**
 * Save status and the signed-in user's plan list. Kept apart from the
 * plan state because it changes twice after every edit ("saving",
 * then "saved"), and only the header badge, the plan title and the
 * print sheet read it.
 */
export interface PlannerSyncValue {
  saveStatus: SaveStatus
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
const PlannerSyncCtx = createContext<PlannerSyncValue | null>(null)
const PlannerFlashCtx = createContext(0)

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerCtx)
  if (!ctx) throw new Error("usePlanner must be used inside <PlannerProvider>")
  return ctx
}

export function usePlannerSync(): PlannerSyncValue {
  const ctx = useContext(PlannerSyncCtx)
  if (!ctx)
    throw new Error("usePlannerSync must be used inside <PlannerProvider>")
  return ctx
}

/**
 * Monotonic counter bumped each time the user asks "validate" — error
 * unit cards watch this to run a brief pulse animation. Using a
 * counter rather than a boolean lets the effect re-fire even if the
 * count would otherwise be unchanged.
 */
export function usePlannerFlash(): number {
  return useContext(PlannerFlashCtx)
}

/**
 * Shows search results without merging them into the planner's maps,
 * which would re-validate and re-render the whole plan after every
 * search. Children read `bundle` layered over the planner's unit data,
 * and adding a unit from inside merges just that unit.
 */
export function UnitDataOverlay({
  bundle,
  children,
}: {
  bundle: UnitBundle | null
  children: React.ReactNode
}) {
  const ctx = usePlanner()
  const value = useMemo<PlannerContextValue>(() => {
    if (!bundle) return ctx
    const maps = mergeUnitMaps(ctx, bundle)
    return {
      ...ctx,
      ...maps,
      isFullYear: (code) => isFullYearUnit(code, maps.offerings),
      addUnit: (yearIndex, slotIndex, code) => {
        ctx.mergeUnitData(unitBundleFor(maps, code))
        ctx.addUnit(yearIndex, slotIndex, code, maps.offerings)
      },
    }
  }, [ctx, bundle])
  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>
}

/** The plan with its year moved to `fallback` when the database lacks it. */
function withKnownYear(
  plan: PlannerState,
  availableYears: readonly string[],
  fallback: string
): PlannerState {
  const year =
    plan.courseYear && availableYears.includes(plan.courseYear)
      ? plan.courseYear
      : fallback
  return { ...plan, courseYear: year }
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
  requestedCourse = null,
}: Omit<PlannerProps, "initialGrades"> & { children: React.ReactNode }) {
  const freshState = useCallback(
    () => defaultState(initialYear, defaultCourse?.code ?? null, 3),
    [initialYear, defaultCourse?.code]
  )
  const [history, dispatch] = useReducer(historyReducer, null, () =>
    initialHistory(freshState())
  )
  const state = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0
  const undo = useCallback(() => dispatch({ type: "undo" }), [])
  const redo = useCallback(() => dispatch({ type: "redo" }), [])

  const [saveStatus, setSaveStatus] = useState<SaveStatus>(
    currentUser ? "saved" : "local"
  )

  const [plans, setPlans] = useState<PlanSummary[]>(initialPlans)
  const [activePlanId, setActivePlanId] = useState<string | null>(
    initialActivePlanId
  )

  const [course, setCourse] = useState<PlannerCourseWithAoS | null>(
    defaultCourse
  )
  const [courses, setCourses] = useState<PlannerCourse[]>(initialCourses)

  // Units, offerings and requisites live in one state object, so every
  // write is a functional update and concurrent fetches can't drop
  // each other's data.
  const [unitData, setUnitData] = useState<UnitMaps>(() =>
    unitMapsFrom(prewarmed)
  )
  const mergeUnitData = useCallback(
    (bundle: UnitBundle, fillEmpty?: readonly string[]) =>
      setUnitData((m) => mergeUnitMaps(m, bundle, fillEmpty)),
    []
  )
  const { units: unitsMap, offerings: offeringsMap } = unitData

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

  /**
   * Fetch a year's course data. The requests run in parallel, but each
   * one resolves only after the ones started before it, so a slow year
   * switch cannot overwrite the course picked after it. Callers set
   * state straight after the await, in the order they started.
   */
  const yearLoadsRef = useRef<Promise<unknown>>(Promise.resolve())
  const fetchYearInOrder = useCallback(
    (year: string, courseCode: string | null, withCourses: boolean) => {
      const request = fetchPlannerYear(year, courseCode, withCourses)
      // The caller sees a failure through `ordered`; this keeps an early
      // one from being reported as unhandled while it waits.
      request.catch(() => {})
      const ordered = yearLoadsRef.current.then(() => request)
      yearLoadsRef.current = ordered.catch(() => {})
      return ordered
    },
    []
  )

  // The latest committed plan, for async work that finishes after
  // later edits (and for `switchPlan` to flush the pending save).
  const lastSnapshotRef = useRef(state)
  useEffect(() => {
    lastSnapshotRef.current = state
  }, [state])

  /**
   * The handbook year and course whose data the planner holds or is
   * loading. When undo or redo moves the plan to another course or
   * year, the effect below sees the mismatch and loads that data.
   */
  const loadedRef = useRef({
    year: initialYear,
    code: defaultCourse?.code ?? null,
  })

  /**
   * Load the course and its unit data for a handbook year in one round
   * trip, plus the course list when the year changed. A new year drops
   * cached units that no study year of the plan reads any more, because
   * another year's offerings and requisites would mis-validate, and
   * keeps the rest so they aren't fetched again; the same year merges.
   * Returns the course, or null when the year lacks it.
   */
  const loadYearData = useCallback(
    async (year: string, courseCode: string | null, yearChanged: boolean) => {
      const before = loadedRef.current
      const target = { year, code: courseCode }
      loadedRef.current = target
      let res: Awaited<ReturnType<typeof fetchYearInOrder>>
      try {
        res = await fetchYearInOrder(year, courseCode, yearChanged)
      } catch (err) {
        // Nothing loaded, so a later reconcile may try again.
        if (loadedRef.current === target) loadedRef.current = before
        throw err
      }
      if (res.courses) setCourses(res.courses)
      setCourse(res.course)
      setUnitData((m) => {
        if (!yearChanged) return mergeUnitMaps(m, res)
        const studyYears = lastSnapshotRef.current.years.length
        const reads = new Set(
          Array.from({ length: Math.max(1, studyYears) }, (_, i) =>
            handbookYearFor(i, year, availableYears)
          )
        )
        return mergeUnitMaps(keepUnitYears(m, reads), res)
      })
      return res.course
    },
    [fetchYearInOrder, availableYears]
  )

  const activePlanIdRef = useRef(activePlanId)
  useEffect(() => {
    activePlanIdRef.current = activePlanId
  }, [activePlanId])

  /**
   * Save `snapshot` as a new plan, make it the active one and put it at
   * the top of the plan list. Callers report failure their own way.
   */
  const createPlanRecord = useCallback(
    async (name: string, snapshot: PlannerState) => {
      const res = await createMyPlanAction(name, snapshot)
      if (res.ok) {
        // Set now, not after the next render, so a debounced save that
        // fires in between saves to this plan instead of creating one.
        activePlanIdRef.current = res.plan.id
        setActivePlanId(res.plan.id)
        setPlans((prev) => [
          { id: res.plan.id, name: res.plan.name, updatedAt: new Date() },
          ...prev,
        ])
      }
      return res
    },
    []
  )

  /**
   * Save `snapshot` as the user's first plan, "My plan". The sign-in
   * migration and a debounced save can both ask before the first create
   * answers, so a create in flight is shared: a second caller waits for
   * it and saves its snapshot to the new plan instead of making another.
   */
  const firstCreateRef = useRef<Promise<CreateResult> | null>(null)
  const createFirstPlan = useCallback(
    async (snapshot: PlannerState): Promise<CreateResult | SaveResult> => {
      const pending = firstCreateRef.current
      if (pending) {
        const created = await pending
        return created.ok
          ? saveMyPlanAction(created.plan.id, snapshot)
          : created
      }
      const create = createPlanRecord("My plan", snapshot)
      firstCreateRef.current = create
      try {
        return await create
      } finally {
        firstCreateRef.current = null
      }
    },
    [createPlanRecord]
  )

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
  const offerCourseRef = useRef<string | null>(null)
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
    if (requestedCourse && (plan.courseCode ?? null) !== requestedCourse) {
      offerCourseRef.current = requestedCourse
    }

    // The saved year may not exist in the DB anymore (e.g. old data
    // got trimmed). Fall back to the server-provided initial year.
    const merged = withKnownYear(plan, availableYears, initialYear)
    dispatch({ type: "hydrate", state: merged })

    if (didMigrateLocal) {
      // Push the migrated plan to the server as a new named plan, then
      // clear localStorage so future logouts don't surface a stale
      // copy. The created plan becomes the active one. (It sets state
      // only once the server answers, not during the effect.)
      void createFirstPlan(merged).then((res) => {
        if (res.ok) {
          clearLocalPlan()
          toast.success("Your plan is now saved to your account")
        } else if (res.reason === "limit") {
          toast.error(PLAN_LIMIT_MESSAGE)
        }
      })
    }

    // The server prewarmed the course and units for its own year and
    // course; refetch only when the saved plan differs.
    const yearChanged = merged.courseYear !== initialYear
    const codeChanged =
      (merged.courseCode ?? null) !== (defaultCourse?.code ?? null)
    if (yearChanged || codeChanged) {
      startCourseTransition(async () => {
        try {
          await loadYearData(
            merged.courseYear,
            merged.courseCode ?? null,
            yearChanged
          )
        } catch (err) {
          toast.error("Couldn't load the plan", {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    }
  }, [
    currentUser,
    initialPlan,
    defaultCourse?.code,
    initialYear,
    availableYears,
    requestedCourse,
    createFirstPlan,
    loadYearData,
  ])

  // Persist plan state on every change. Skip the very first render
  // (would just round-trip the default), then route based on auth:
  //   signed-in & has activePlanId → debounced server save
  //   signed-in & no activePlanId  → first edit creates "My plan",
  //                                  promotes it to active
  //   anonymous                     → localStorage write
  //
  // The timer reads activePlanIdRef and lastSnapshotRef (declared
  // above), so `switchPlan` can flush the in-flight save synchronously
  // without tripping over stale closure state.
  const firstPersistRef = useRef(true)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveLocally = useCallback((snapshot: PlannerState) => {
    writeLocalPlan(snapshot)
    setSaveStatus("local")
  }, [])

  /**
   * Status after a server save or create. A lapsed session falls back
   * to this device, so the edit isn't lost.
   */
  const applySaveResult = useCallback(
    (
      res: SaveResult | Awaited<ReturnType<typeof createMyPlanAction>>,
      snapshot: PlannerState
    ) => {
      if (res.ok) {
        setSaveStatus("saved")
      } else if (res.reason === "unauthenticated") {
        saveLocally(snapshot)
      } else {
        if (res.reason === "limit") toast.error(PLAN_LIMIT_MESSAGE)
        setSaveStatus("error")
      }
    },
    [saveLocally]
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
            applySaveResult(res, snapshot)
            if (!res.ok) return
            // Bump our local "most recently updated" snapshot for plan
            // list ordering. Cheap; avoids a refetch.
            setPlans((prev) =>
              prev
                .map((p) =>
                  p.id === planId ? { ...p, updatedAt: new Date() } : p
                )
                .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            )
          })
        } else {
          // First edit by a signed-in user with no plan yet. Promote
          // their work to a brand-new "My plan" record.
          void createFirstPlan(snapshot).then((res) =>
            applySaveResult(res, snapshot)
          )
        }
      }, SERVER_SAVE_DEBOUNCE)
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      }
    }

    // Anonymous: keep on this device.
    saveLocally(state)
  }, [state, currentUser, saveLocally, applySaveResult, createFirstPlan])

  useUnitDataHydration({ state, availableYears, unitData, mergeUnitData })

  const plannedCodes = useMemo(() => plannedUnitCodes(state), [state])

  const validations = useMemo(
    () =>
      validatePlan(
        state,
        unitData.units,
        unitData.offerings,
        unitData.requisites
      ),
    [state, unitData]
  )

  useFullYearSelfHeal({
    state,
    offeringsMap,
    plannedCodes,
    dispatch,
  })

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
    (
      yearIndex: number,
      slotIndex: number,
      code: string,
      offerings: ReadonlyMap<string, PlannerOffering[]> = offeringsMap
    ) => {
      if (isFullYearUnit(code, offerings)) {
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
        // Only this year, so a retake in another year survives.
        dispatch({ type: "remove_full_year_unit", code, yearIndex })
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
          const res = await fetchUnits(unique, state.courseYear)
          mergeUnitData(res, unique)
          // distribute() needs the merged data now, not after the
          // state update lands. The fetched codes are all written
          // over, so a stale snapshot only affects codes it doesn't
          // place.
          const { placements, skipped, unplaced } = distribute({
            codes: unique,
            ...mergeUnitMaps(unitData, res, unique),
            state,
          })
          dispatch({ type: "bulk_load", placements, mode })
          // A full-year unit gives two placements, one per semester.
          const added = new Set(placements.map((p) => p.code)).size
          const notes = [
            skipped.length > 0 &&
              `${skipped.length} already on plan or credited`,
            unplaced.length > 0 && `${unplaced.length} didn't fit`,
          ].filter(Boolean)
          const message = `${label}: ${added} unit${added === 1 ? "" : "s"} added${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`
          if (added === 0) toast.warning(message)
          else toast.success(message)
        } catch (err) {
          toast.error(`Couldn't load ${label}`, {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    },
    [state, unitData, mergeUnitData]
  )

  const switchCourse = useCallback(
    async (code: string) => {
      const year = state.courseYear
      startCourseTransition(async () => {
        try {
          // Same year, so the units already cached stay valid: merge.
          const c = await loadYearData(year, code, false)
          // One undo step reverts the whole switch.
          dispatch({
            type: "batch",
            actions: [
              { type: "set_course", code },
              ...(c
                ? [
                    {
                      type: "set_year_count" as const,
                      count: yearsNeeded(c.creditPoints),
                    },
                  ]
                : []),
            ],
          })
        } catch (err) {
          toast.error("Couldn't load course", {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    },
    [state.courseYear, loadYearData]
  )

  // A "Plan this course" link landed on a saved plan for another
  // course: offer the switch once. The ref keeps the click on the
  // switchCourse of the moment, which knows the plan's restored year.
  const switchCourseRef = useRef(switchCourse)
  useEffect(() => {
    switchCourseRef.current = switchCourse
  }, [switchCourse])
  useEffect(() => {
    const code = offerCourseRef.current
    if (!code) return
    offerCourseRef.current = null
    toast("Opened your saved plan", {
      description: `You followed a link to plan ${code}.`,
      duration: 12000,
      action: {
        label: `Switch to ${code}`,
        onClick: () => void switchCourseRef.current(code),
      },
    })
  }, [state.courseCode])

  const switchYear = useCallback(
    async (year: string) => {
      if (year === state.courseYear) return
      startCourseTransition(async () => {
        try {
          capture("handbook_year_switched", {
            from_year: state.courseYear,
            to_year: year,
            course_code: state.courseCode,
          })
          dispatch({ type: "set_year", year })
          // The course may not exist in the new year — surface that as
          // a null course and let the UI prompt for a new pick.
          const code = state.courseCode
          const c = await loadYearData(year, code, true)
          if (!c && code) {
            toast.warning(`${code} isn't in the ${year} handbook`, {
              description:
                "Pick another course or switch back to a year that has it.",
            })
          }
        } catch (err) {
          toast.error("Couldn't switch year", {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    },
    [state.courseYear, state.courseCode, loadYearData]
  )

  // Undo or redo of a course or year switch, or a reset to a fresh
  // plan, changes the plan's course or year without loading anything.
  // Load what the plan now names, so the course panel, validation and
  // autosave agree with it. The switches and plan loads set loadedRef
  // before their state change renders, so this skips them. It acts only
  // when the plan's course or year changed, not on mount, where the
  // restore effect has already started its own load.
  const planCourseRef = useRef({
    year: state.courseYear,
    code: state.courseCode ?? null,
  })
  useEffect(() => {
    const want = { year: state.courseYear, code: state.courseCode ?? null }
    const prev = planCourseRef.current
    planCourseRef.current = want
    if (prev.year === want.year && prev.code === want.code) return
    const loaded = loadedRef.current
    if (loaded.year === want.year && loaded.code === want.code) return
    startCourseTransition(async () => {
      try {
        await loadYearData(want.year, want.code, want.year !== loaded.year)
      } catch (err) {
        toast.error("Couldn't load the plan", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
      }
    })
  }, [state.courseYear, state.courseCode, loadYearData])

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
    applySaveResult(await saveMyPlanAction(planId, snapshot), snapshot)
  }, [currentUser, applySaveResult])

  /**
   * Show a fetched plan: dispatch its state, then load the course and
   * unit data for its year and course.
   */
  const hydrateFetchedPlan = useCallback(
    async (planState: PlannerState) => {
      const merged = withKnownYear(planState, availableYears, initialYear)
      dispatch({ type: "hydrate", state: merged })

      // Pause the persist effect from auto-saving the hydrated state;
      // the snapshot we just dispatched IS the canonical server state.
      firstPersistRef.current = true

      startCourseTransition(async () => {
        try {
          await loadYearData(
            merged.courseYear,
            merged.courseCode ?? null,
            merged.courseYear !== state.courseYear
          )
        } catch (err) {
          toast.error("Couldn't load the plan", {
            description: err instanceof Error ? err.message : "Unknown error",
          })
        }
      })
    },
    [availableYears, initialYear, state.courseYear, loadYearData]
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
        : freshState()
      const res = await createPlanRecord(name.trim() || "My plan", seedState)
      if (!res.ok) {
        toast.error(
          res.reason === "limit" ? PLAN_LIMIT_MESSAGE : "Couldn't create plan"
        )
        return
      }
      // Hydrate so the editor reflects the new plan's seed state.
      await hydrateFetchedPlan(seedState)
      setSaveStatus("saved")
      toast.success(`Created “${res.plan.name}”`)
    },
    [
      currentUser,
      flushPendingSave,
      createPlanRecord,
      hydrateFetchedPlan,
      freshState,
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
          dispatch({ type: "hydrate", state: freshState() })
        }
      }
    },
    [currentUser, plans, activePlanId, switchPlan, freshState]
  )

  // Narrow the course to the student's campus before anything
  // downstream sees it, so the requirements panel, the progress ring
  // and the core badge all agree. Identity is preserved when no campus
  // is set, so this is free for the majority of plans.
  const scopedCourse = useMemo(
    () => (course ? courseForCampus(course, state.campus) : null),
    [course, state.campus]
  )

  // From the raw course, never the narrowed one — see `campuses` on
  // PlannerContextValue.
  const campuses = useMemo(
    () => (course ? availableCampuses(course) : []),
    [course]
  )

  const summary = useMemo(
    () => summarizePlan(state, scopedCourse, unitsMap, offeringsMap),
    [state, scopedCourse, unitsMap, offeringsMap]
  )

  const pickedAos = useMemo(
    () =>
      scopedCourse ? pickedAosEntries(scopedCourse, state.selectedAos) : [],
    [scopedCourse, state.selectedAos]
  )

  const coreCodes = useMemo(
    () =>
      coreUnitCodes(scopedCourse, new Set(pickedAos.map((p) => p.aos.code))),
    [scopedCourse, pickedAos]
  )

  // Memoize each context value so a fresh object identity is only
  // produced when one of its own slices changes. Every callback is
  // wrapped in useCallback and every derived collection in useMemo, so
  // each deps list is the complete set of identity-change sources.
  const value = useMemo<PlannerContextValue>(
    () => ({
      state,
      dispatch,
      undo,
      redo,
      canUndo,
      canRedo,
      currentUser,
      courses,
      course: scopedCourse,
      campuses,
      availableYears,
      units: unitData.units,
      offerings: unitData.offerings,
      requisites: unitData.requisites,
      validations,
      plannedCodes,
      summary,
      pickedAos,
      coreCodes,
      mergeUnitData,
      isFullYear,
      fullYearCodes,
      addUnit,
      removeUnit,
      switchCourse,
      switchYear,
      loadUnitsTemplate,
      flashErrors,
    }),
    [
      state,
      undo,
      redo,
      canUndo,
      canRedo,
      currentUser,
      courses,
      scopedCourse,
      campuses,
      availableYears,
      unitData,
      validations,
      plannedCodes,
      summary,
      pickedAos,
      coreCodes,
      mergeUnitData,
      isFullYear,
      fullYearCodes,
      addUnit,
      removeUnit,
      switchCourse,
      switchYear,
      loadUnitsTemplate,
      flashErrors,
    ]
  )

  const sync = useMemo<PlannerSyncValue>(
    () => ({
      saveStatus,
      plans,
      activePlanId,
      switchPlan,
      createPlan,
      renamePlan,
      deletePlan,
    }),
    [
      saveStatus,
      plans,
      activePlanId,
      switchPlan,
      createPlan,
      renamePlan,
      deletePlan,
    ]
  )

  return (
    <PlannerCtx.Provider value={value}>
      <PlannerSyncCtx.Provider value={sync}>
        <PlannerFlashCtx.Provider value={flashVersion}>
          {children}
        </PlannerFlashCtx.Provider>
      </PlannerSyncCtx.Provider>
    </PlannerCtx.Provider>
  )
}
