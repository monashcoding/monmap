"use server"

import { getCurrentUser } from "@/lib/auth-server"
import {
  createUserPlan,
  deleteUserPlan,
  fetchCourseWithAoS,
  getUserPlanById,
  hydratePlannerUnits,
  hydratePlannerUnitsMultiYear,
  listAvailableYears,
  listCoursesForPicker,
  listUserPlans,
  type PlanSummary,
  renameUserPlan,
  searchUnits,
  updateUserPlanState,
} from "@/lib/db/queries"
export type { PlanSummary } from "@/lib/db/queries"
import type {
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"

export async function loadCourseAction(
  code: string,
  year: string
): Promise<PlannerCourseWithAoS | null> {
  return fetchCourseWithAoS(code, year)
}

export async function searchUnitsAction(
  query: string,
  year: string
): Promise<PlannerUnit[]> {
  return searchUnits(query, 25, year)
}

export async function listCoursesAction(
  search: string | null,
  year: string
): Promise<PlannerCourse[]> {
  return listCoursesForPicker(search, 300, year)
}

export async function listAvailableYearsAction(): Promise<string[]> {
  return listAvailableYears()
}

/**
 * Hydrate units across multiple handbook years in one server round-trip.
 * codesByYear maps handbook year → unit codes to fetch from that year.
 */
export async function hydrateUnitsMultiYearAction(
  codesByYear: Record<string, string[]>
): Promise<{
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
}> {
  const { units, offerings, requisites } = await hydratePlannerUnitsMultiYear(
    new Map(Object.entries(codesByYear))
  )
  return {
    units: Object.fromEntries(units),
    offerings: Object.fromEntries(offerings),
    requisites: Object.fromEntries(requisites),
  }
}

/**
 * Convert the maps to plain objects so Next.js can serialize them
 * across the server/client boundary.
 */
export async function hydrateUnitsAction(
  codes: string[],
  year: string
): Promise<{
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
}> {
  const { units, offerings, requisites } = await hydratePlannerUnits(
    codes,
    year
  )
  return {
    units: Object.fromEntries(units),
    offerings: Object.fromEntries(offerings),
    requisites: Object.fromEntries(requisites),
  }
}

/* ------------------------------------------------------------------ *
 * Per-user plan persistence (multi-plan)
 *
 * Only signed-in users can persist. The client falls back to
 * localStorage for anonymous visitors — see PlannerProvider for the
 * policy. Every mutation is gated by ownership: a planId from one user
 * cannot read or write another user's plan even if guessed.
 * ------------------------------------------------------------------ */

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "invalid" | "not_found" }

export async function listMyPlansAction(): Promise<PlanSummary[]> {
  const u = await getCurrentUser()
  if (!u) return []
  return listUserPlans(u.id)
}

export async function getMyPlanAction(
  planId: string
): Promise<{ id: string; name: string; state: PlannerState } | null> {
  const u = await getCurrentUser()
  if (!u) return null
  return getUserPlanById(planId, u.id)
}

export async function saveMyPlanAction(
  planId: string,
  state: PlannerState
): Promise<SaveResult> {
  const u = await getCurrentUser()
  if (!u) return { ok: false, reason: "unauthenticated" }
  if (!isPlannerStateLike(state)) return { ok: false, reason: "invalid" }
  const ok = await updateUserPlanState(planId, u.id, state)
  return ok ? { ok: true } : { ok: false, reason: "not_found" }
}

export async function createMyPlanAction(
  name: string,
  state: PlannerState
): Promise<
  | { ok: true; plan: { id: string; name: string } }
  | { ok: false; reason: "unauthenticated" | "invalid" }
> {
  const u = await getCurrentUser()
  if (!u) return { ok: false, reason: "unauthenticated" }
  if (!isPlannerStateLike(state)) return { ok: false, reason: "invalid" }
  const trimmed = name.trim().slice(0, 80) || "My plan"
  const plan = await createUserPlan(u.id, trimmed, state)
  return { ok: true, plan }
}

export async function renameMyPlanAction(
  planId: string,
  name: string
): Promise<SaveResult> {
  const u = await getCurrentUser()
  if (!u) return { ok: false, reason: "unauthenticated" }
  const trimmed = name.trim().slice(0, 80)
  if (!trimmed) return { ok: false, reason: "invalid" }
  const ok = await renameUserPlan(planId, u.id, trimmed)
  return ok ? { ok: true } : { ok: false, reason: "not_found" }
}

export async function deleteMyPlanAction(planId: string): Promise<SaveResult> {
  const u = await getCurrentUser()
  if (!u) return { ok: false, reason: "unauthenticated" }
  const ok = await deleteUserPlan(planId, u.id)
  return ok ? { ok: true } : { ok: false, reason: "not_found" }
}

/**
 * Cheap structural check — we don't want a malicious client jamming
 * arbitrary JSON into a plan row. Anything that survives this is
 * trusted; the validator/reducer on read tolerates stray fields.
 */
function isPlannerStateLike(v: unknown): v is PlannerState {
  if (!v || typeof v !== "object") return false
  const s = v as Record<string, unknown>
  return (
    typeof s.courseYear === "string" &&
    (s.courseCode === null || typeof s.courseCode === "string") &&
    s.selectedAos !== null &&
    typeof s.selectedAos === "object" &&
    Array.isArray(s.years)
  )
}
