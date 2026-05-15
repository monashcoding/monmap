"use server"

import { getCurrentUser } from "@/lib/auth-server"
import {
  bulkUpsertUserGrades,
  createUserPlan,
  deleteUserGrade,
  deleteUserPlan,
  expandCourseClosure,
  expandRequisiteGraph,
  fetchCourseWithAoS,
  fetchEnrolmentRulesForCodes,
  getUserPlanById,
  hydratePlannerUnits,
  hydratePlannerUnitsMultiYear,
  listAvailableYears,
  listCoursesForPicker,
  listUserGrades,
  listUserGradesWithTitles,
  listUserPlans,
  type PlanSummary,
  type UserGradeWithTitle,
  renameUserPlan,
  searchUnits,
  updateUserPlanState,
  upsertUserGrade,
} from "@/lib/db/queries"
export type { PlanSummary, UserGradeWithTitle } from "@/lib/db/queries"
import type {
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"
import { defaultState } from "@/lib/planner/state"
import { HANDBOOK_YEAR } from "@/lib/db/client"
import { redirect } from "next/navigation"

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
 * Tree page
 *
 * One server action expands the graph for the current controls value
 * and hydrates every unit + its offerings + structured rules +
 * enrolment-rule prose. The page state is small enough that doing
 * this in one round-trip is much cheaper than per-mutation patches.
 * ------------------------------------------------------------------ */

import type { TreeControlsValue, TreeGraphPayload } from "@/lib/tree/payload"
export type { TreeControlsValue, TreeGraphPayload } from "@/lib/tree/payload"

export async function fetchTreeDataAction(
  controls: TreeControlsValue
): Promise<TreeGraphPayload> {
  const empty: TreeGraphPayload = {
    graph: { seeds: [], nodes: [], edges: [] },
    units: {},
    offerings: {},
    requisites: {},
    enrolmentRules: {},
  }

  const depth = Math.max(1, Math.min(5, controls.depth))

  const graph = await (async () => {
    if (controls.mode === "course") {
      if (!controls.courseCode) return empty.graph
      return expandCourseClosure(
        controls.courseCode,
        controls.aosCode,
        controls.year,
        depth
      )
    }
    if (!controls.unitCode) return empty.graph
    return expandRequisiteGraph(
      [controls.unitCode],
      controls.year,
      controls.direction,
      depth
    )
  })()

  if (graph.nodes.length === 0) return empty

  // Hydrate metadata for every node so the renderer doesn't have to
  // round-trip for badges / synopsis / etc.
  const { units, offerings, requisites } = await hydratePlannerUnits(
    graph.nodes,
    controls.year
  )
  const enrolment = await fetchEnrolmentRulesForCodes(
    graph.nodes,
    controls.year
  )

  return {
    graph,
    units: Object.fromEntries(units),
    offerings: Object.fromEntries(offerings),
    requisites: Object.fromEntries(requisites),
    enrolmentRules: Object.fromEntries(enrolment),
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

export async function createBlankPlanAction(): Promise<never> {
  const u = await getCurrentUser()
  if (!u) redirect("/sign-in")
  const year = (await listAvailableYears()).at(-1) ?? HANDBOOK_YEAR
  const state = defaultState(year, null, 3)
  const plan = await createUserPlan(u.id, "Default plan", state)
  redirect(`/?plan=${plan.id}`)
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
/* ------------------------------------------------------------------ *
 * Per-user grades (account-global)
 * ------------------------------------------------------------------ */

export async function listMyGradesAction(): Promise<Record<string, number>> {
  const u = await getCurrentUser()
  if (!u) return {}
  return listUserGrades(u.id)
}

export async function listMyGradesWithTitlesAction(): Promise<
  UserGradeWithTitle[]
> {
  const u = await getCurrentUser()
  if (!u) return []
  return listUserGradesWithTitles(u.id)
}

export async function setMyGradeAction(
  unitCode: string,
  mark: number | null
): Promise<SaveResult> {
  const u = await getCurrentUser()
  if (!u) return { ok: false, reason: "unauthenticated" }
  if (!isUnitCode(unitCode)) return { ok: false, reason: "invalid" }
  if (mark === null) {
    await deleteUserGrade(u.id, unitCode)
  } else {
    if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
      return { ok: false, reason: "invalid" }
    }
    await upsertUserGrade(u.id, unitCode, Math.round(mark))
  }
  return { ok: true }
}

/**
 * Used during the localStorage → server migration on first sign-in.
 * Anything already on the server wins (no clobber); only codes the user
 * doesn't have a server-side grade for get inserted.
 */
export async function migrateMyGradesAction(
  grades: Record<string, number>
): Promise<{ ok: boolean }> {
  const u = await getCurrentUser()
  if (!u) return { ok: false }
  const existing = await listUserGrades(u.id)
  const toInsert: Record<string, number> = {}
  for (const [code, mark] of Object.entries(grades)) {
    if (!isUnitCode(code)) continue
    if (!Number.isFinite(mark) || mark < 0 || mark > 100) continue
    if (existing[code] !== undefined) continue
    toInsert[code] = Math.round(mark)
  }
  if (Object.keys(toInsert).length > 0) {
    await bulkUpsertUserGrades(u.id, toInsert)
  }
  return { ok: true }
}

function isUnitCode(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= 16
}

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
