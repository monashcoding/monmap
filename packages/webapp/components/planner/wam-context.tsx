"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"

import { usePlanner } from "./planner-context"

const WAM_STORAGE_KEY = "monmap.grades.v1"

function loadGradesFromStorage(): Map<string, number> {
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

export interface WamContextValue {
  wamMode: boolean
  showGrade: boolean
  /** Live in-memory grades — what the inputs show while editing. */
  grades: Map<string, number>
  toggleWamMode: () => void
  toggleShowGrade: () => void
  setGrade: (code: string, mark: number | null) => void
  saveGrades: () => void
  /** WAM computed from saved grades only — doesn't update until Save is clicked. */
  wam: number | null
}

const WamCtx = createContext<WamContextValue | null>(null)

export function useWam(): WamContextValue {
  const ctx = useContext(WamCtx)
  if (!ctx) throw new Error("useWam must be used inside <WamProvider>")
  return ctx
}

export function WamProvider({ children }: { children: React.ReactNode }) {
  const { units, plannedCodes } = usePlanner()
  const [wamMode, setWamMode] = useState(false)
  const [showGrade, setShowGrade] = useState(false)

  // grades: what the user is currently editing (shown in inputs)
  const [grades, setGrades] = useState<Map<string, number>>(
    loadGradesFromStorage
  )

  // savedGrades: last persisted snapshot — WAM is computed from this only
  const [savedGrades, setSavedGrades] = useState<Map<string, number>>(
    loadGradesFromStorage
  )

  const toggleWamMode = useCallback(() => setWamMode((v) => !v), [])
  const toggleShowGrade = useCallback(() => setShowGrade((v) => !v), [])

  const setGrade = useCallback((code: string, mark: number | null) => {
    setGrades((prev) => {
      const next = new Map(prev)
      if (mark === null) next.delete(code)
      else next.set(code, mark)
      return next
    })
  }, [])

  const saveGrades = useCallback(() => {
    try {
      const obj = Object.fromEntries(grades)
      localStorage.setItem(WAM_STORAGE_KEY, JSON.stringify(obj))
      setSavedGrades(new Map(grades))
      setWamMode(false)
      toast.success("Grades saved")
    } catch {
      toast.error("Couldn't save grades")
    }
  }, [grades])

  const wam = useMemo(() => {
    let totalWeight = 0
    let totalCp = 0
    for (const code of plannedCodes) {
      const mark = savedGrades.get(code)
      if (mark === undefined) continue
      const cp = units.get(code)?.creditPoints ?? 6
      totalWeight += mark * cp
      totalCp += cp
    }
    if (totalCp === 0) return null
    return totalWeight / totalCp
  }, [savedGrades, plannedCodes, units])

  return (
    <WamCtx.Provider
      value={{
        wamMode,
        showGrade,
        grades,
        toggleWamMode,
        toggleShowGrade,
        setGrade,
        saveGrades,
        wam,
      }}
    >
      {children}
    </WamCtx.Provider>
  )
}
