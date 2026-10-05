/**
 * localStorage helpers for the anonymous-user plan. This module owns
 * the plan's storage key and shape; nothing else reads or writes it.
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
