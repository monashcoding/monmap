"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { migrateMyGradesAction, setMyGradeAction } from "@/app/actions"
import { capture } from "@/lib/analytics"
import { computeGpa, computeWam, type GradedUnit } from "@/lib/planner/grades"
import { STANDARD_CP } from "@/lib/planner/types"

import { usePlanner } from "./planner-context"

const WAM_STORAGE_KEY = "monmap.grades.v1"
const SHOW_RESULTS_KEY = "monmap.showResults.v1"
/** ms to wait after the last edit on a given code before pushing it. */
const SERVER_SAVE_DEBOUNCE = 600

type GradeMap = Map<string, number>

function loadGradesFromStorage(): GradeMap {
  if (typeof window === "undefined") return new Map()
  try {
    const raw = localStorage.getItem(WAM_STORAGE_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw) as Record<string, number>
    return new Map(Object.entries(obj).map(([k, v]) => [k, Number(v)]))
  } catch {
    return new Map()
  }
}

function writeLocalStorage(grades: GradeMap) {
  try {
    localStorage.setItem(
      WAM_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(grades))
    )
  } catch {
    /* storage full or disabled — keep in-memory edits, drop persistence */
  }
}

function clearLocalStorage() {
  try {
    localStorage.removeItem(WAM_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export interface WamContextValue {
  /** Results mode: unit cards show marks and accept new ones. */
  showResults: boolean
  toggleShowResults: () => void
  grades: GradeMap
  setGrade: (code: string, mark: number | null) => void
  /** Over units in the plan that have a mark; null when none do. */
  wam: number | null
  gpa: number | null
  gradedUnitCount: number
  gradedCreditPoints: number
}

const WamCtx = createContext<WamContextValue | null>(null)

export function useWam(): WamContextValue {
  const ctx = useContext(WamCtx)
  if (!ctx) throw new Error("useWam must be used inside <WamProvider>")
  return ctx
}

export function WamProvider({
  children,
  signedIn,
  initialGrades,
}: {
  children: React.ReactNode
  /** True when a user is logged in — drives server vs localStorage. */
  signedIn: boolean
  /**
   * Server-side grade snapshot for signed-in users; null/undefined for
   * anon visitors (we read localStorage on mount instead).
   */
  initialGrades: Record<string, number> | null
}) {
  const { units, plannedCodes } = usePlanner()
  const [showResults, setShowResults] = useState(false)

  // Remember the Results toggle per browser. Read after mount so the
  // server render and hydration agree.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(SHOW_RESULTS_KEY) === "1") setShowResults(true)
    } catch {
      /* storage disabled */
    }
  }, [])

  // Initial state is auth-aware:
  //   signed-in            → server-provided snapshot (empty if first time)
  //   anonymous            → localStorage
  // The localStorage → server migration runs in the effect below so we
  // don't fire server actions during render.
  const [grades, setGrades] = useState<GradeMap>(() => {
    if (signedIn) {
      return new Map(Object.entries(initialGrades ?? {}))
    }
    return loadGradesFromStorage()
  })

  // On first mount as a signed-in user with empty server grades but a
  // populated localStorage bucket: push the local marks up, then clear
  // them so a future logout doesn't surface a stale shadow copy.
  const migrationDoneRef = useRef(false)
  useEffect(() => {
    if (!signedIn || migrationDoneRef.current) return
    migrationDoneRef.current = true
    if (initialGrades && Object.keys(initialGrades).length > 0) return
    const local = loadGradesFromStorage()
    if (local.size === 0) return
    const obj = Object.fromEntries(local)
    void migrateMyGradesAction(obj).then((res) => {
      if (!res.ok) return
      setGrades((prev) => {
        // Prefer anything the user already typed since mount; backfill
        // the rest from the migrated bucket.
        const next = new Map(prev)
        for (const [k, v] of local) if (!next.has(k)) next.set(k, v)
        return next
      })
      clearLocalStorage()
    })
  }, [signedIn, initialGrades])

  const toggleShowResults = useCallback(() => {
    setShowResults((v) => {
      capture("results_mode_toggled", { enabled: !v })
      try {
        localStorage.setItem(SHOW_RESULTS_KEY, v ? "0" : "1")
      } catch {
        /* storage disabled */
      }
      return !v
    })
  }, [])

  // Per-code debounce timers so rapid keystrokes coalesce into a single
  // server write per unit. Map persists for the provider's lifetime.
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  )
  useEffect(() => {
    const timers = saveTimersRef.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  const setGrade = useCallback(
    (code: string, mark: number | null) => {
      setGrades((prev) => {
        const next = new Map(prev)
        if (mark === null) next.delete(code)
        else next.set(code, mark)
        if (!signedIn) writeLocalStorage(next)
        return next
      })

      if (!signedIn) return

      const timers = saveTimersRef.current
      const existing = timers.get(code)
      if (existing) clearTimeout(existing)
      timers.set(
        code,
        setTimeout(() => {
          timers.delete(code)
          void setMyGradeAction(code, mark)
        }, SERVER_SAVE_DEBOUNCE)
      )
    },
    [signedIn]
  )

  // Units in the plan that have a mark. A unit with no handbook row
  // yet counts as 6 credit points, the common case.
  const graded = useMemo<GradedUnit[]>(() => {
    const out: GradedUnit[] = []
    for (const code of plannedCodes) {
      const mark = grades.get(code)
      if (mark === undefined) continue
      const unit = units.get(code)
      out.push({
        mark,
        creditPoints: unit?.creditPoints ?? STANDARD_CP,
        level: unit?.level,
      })
    }
    return out
  }, [grades, plannedCodes, units])

  const wam = useMemo(() => computeWam(graded), [graded])
  const gpa = useMemo(() => computeGpa(graded), [graded])
  const gradedCreditPoints = useMemo(
    () => graded.reduce((n, u) => n + u.creditPoints, 0),
    [graded]
  )

  const value = useMemo<WamContextValue>(
    () => ({
      showResults,
      toggleShowResults,
      grades,
      setGrade,
      wam,
      gpa,
      gradedUnitCount: graded.length,
      gradedCreditPoints,
    }),
    [
      showResults,
      toggleShowResults,
      grades,
      setGrade,
      wam,
      gpa,
      graded.length,
      gradedCreditPoints,
    ]
  )

  return <WamCtx.Provider value={value}>{children}</WamCtx.Provider>
}
