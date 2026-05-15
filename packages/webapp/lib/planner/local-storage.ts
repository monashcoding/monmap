/**
 * localStorage helpers for the anonymous-user plan. Centralised here so
 * the storage key and shape are only specified once across the codebase.
 */

import type { PlannerState } from "@/lib/planner/types"

export const PLAN_STORAGE_KEY = "monmap.plan.v1"

/**
 * Read a previously persisted plan from localStorage. Returns null on
 * missing/corrupt data — corrupt local state is the user's problem, not
 * something to surface as an error.
 */
export function readLocalPlan(): PlannerState | null {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PlannerState
    if (!parsed || !Array.isArray(parsed.years)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeLocalPlan(snapshot: PlannerState): void {
  try {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* storage full or disabled — drop the write */
  }
}

export function clearLocalPlan(): void {
  try {
    localStorage.removeItem(PLAN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Returns the correct handbook year for a given study-year index.
 * If the exact calendar year doesn't exist in the DB, falls back to
 * the latest available year (so Year 4 in 2024 → 2027 missing → 2026).
 */
export function handbookYearFor(
  studyYearIndex: number,
  courseYear: string,
  availableYears: readonly string[]
): string {
  const target = String(Number(courseYear) + studyYearIndex)
  if (availableYears.includes(target)) return target
  return [...availableYears].sort().at(-1) ?? courseYear
}
