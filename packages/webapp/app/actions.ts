"use server"

import { getClaims, getCurrentUser } from "@/lib/auth-server"
import { getPostHogClient } from "@/lib/posthog-server"
import {
  cleanCodes,
  cleanCodesByYear,
  cleanGradeCode,
  cleanMark,
  cleanPlanName,
  cleanQuery,
  cleanTreeControls,
  cleanYear,
  isCode,
  isPlannerState,
  MAX_GRADES_PER_USER,
  MAX_PLANS_PER_USER,
} from "@/lib/db/input"
import {
  bulkUpsertUserGrades,
  countUserPlans,
  createUserPlan,
  deleteUserGrade,
  deleteUserPlan,
  duplicateUserPlan,
  expandRequisiteGraph,
  fetchCourseWithAoS,
  fetchUnitText,
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
  searchUnitsRich,
  updateUserPlanState,
  upsertUserGrade,
} from "@/lib/db/queries"
export type { PlanSummary, UserGradeWithTitle } from "@/lib/db/queries"
import {
  plannerUnitCodes,
  type PlannerCourse,
  type PlannerCourseWithAoS,
  type PlannerOffering,
  type PlannerState,
  type PlannerUnit,
  type RequisiteBlock,
  type UnitText,
} from "@/lib/planner/types"
import { defaultState } from "@/lib/planner/state"
import type { TreeControlsValue, TreeGraphPayload } from "@/lib/tree/payload"
import { EMPTY_TREE_PAYLOAD, prefetchTreeData } from "@/lib/tree/prefetch"
import type { TreeEdge } from "@/lib/tree/types"
import { redirect } from "next/navigation"

/*
 * Every export here is a public POST endpoint that anyone can call with
 * any arguments, so each one checks its input (lib/db/input.ts) before
 * it queries. Bad input gets an empty result, not an error, so a stale
 * client still renders.
 */

/** `year` when it is a handbook year in the database. */
async function knownYear(year: unknown): Promise<string | null> {
  return cleanYear(year, await listAvailableYears())
}

interface Hydrated {
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
}

const NOTHING_HYDRATED: Hydrated = { units: {}, offerings: {}, requisites: {} }

/** Plain objects, so Next.js can serialise the maps to the client. */
function plain(h: Awaited<ReturnType<typeof hydratePlannerUnits>>): Hydrated {
  return {
    units: Object.fromEntries(h.units),
    offerings: Object.fromEntries(h.offerings),
    requisites: Object.fromEntries(h.requisites),
  }
}

export async function loadCourseAction(
  code: string,
  year: string
): Promise<PlannerCourseWithAoS | null> {
  const y = await knownYear(year)
  if (!y || !isCode(code)) return null
  return fetchCourseWithAoS(code, y)
}

/**
 * Everything the planner needs after a year or plan switch, in one
 * round trip: the course list (when `withCourses`), the course, and
 * unit data for every unit the course can place. The course list and
 * the course load in parallel.
 */
export async function loadPlannerYearAction(
  year: string,
  courseCode: string | null,
  opts?: { withCourses?: boolean }
): Promise<
  {
    courses: PlannerCourse[] | null
    course: PlannerCourseWithAoS | null
  } & Hydrated
> {
  const y = await knownYear(year)
  if (!y) return { courses: null, course: null, ...NOTHING_HYDRATED }
  const [courses, course] = await Promise.all([
    opts?.withCourses ? listCoursesForPicker(null, 500, y) : null,
    isCode(courseCode) ? fetchCourseWithAoS(courseCode, y) : null,
  ])
  if (!course) return { courses, course: null, ...NOTHING_HYDRATED }
  const hydrated = await hydratePlannerUnits(plannerUnitCodes(course), y)
  return { courses, course, ...plain(hydrated) }
}

export async function searchUnitsAction(
  query: string,
  year: string
): Promise<PlannerUnit[]> {
  const y = await knownYear(year)
  const q = cleanQuery(query)
  if (!y || !q) return []
  return searchUnits(q, 25, y)
}

/**
 * Smart search: text-match a wider candidate pool and bundle every
 * candidate's offerings + requisites so the client can rerank with
 * personalization signals (slot fit, prereq readiness, AoS membership)
 * without a second roundtrip. `rank` preserves the server-side
 * text-match order keyed by code so the client can use it as a
 * tiebreaker.
 */
export async function searchUnitsRichAction(
  query: string,
  year: string
): Promise<Hydrated & { rank: Record<string, number> }> {
  const y = await knownYear(year)
  const q = cleanQuery(query)
  if (!y || !q) return { ...NOTHING_HYDRATED, rank: {} }
  const { rank, ...hydrated } = await searchUnitsRich(q, y)
  return { ...plain(hydrated), rank: Object.fromEntries(rank) }
}

export async function listCoursesAction(
  search: string | null,
  year: string
): Promise<PlannerCourse[]> {
  const y = await knownYear(year)
  if (!y) return []
  return listCoursesForPicker(cleanQuery(search) || null, 500, y)
}

/**
 * Hydrate units across multiple handbook years in one server round-trip.
 * codesByYear maps handbook year → unit codes to fetch from that year.
 */
export async function hydrateUnitsMultiYearAction(
  codesByYear: Record<string, string[]>
): Promise<Hydrated> {
  const byYear = cleanCodesByYear(codesByYear, await listAvailableYears())
  if (byYear.size === 0) return NOTHING_HYDRATED
  return plain(await hydratePlannerUnitsMultiYear(byYear))
}

export async function hydrateUnitsAction(
  codes: string[],
  year: string
): Promise<Hydrated> {
  const y = await knownYear(year)
  const list = cleanCodes(codes)
  if (!y || list.length === 0) return NOTHING_HYDRATED
  return plain(await hydratePlannerUnits(list, y))
}

/** One unit and its equivalents: what one detail panel shows. */
const MAX_TEXT_CODES = 12

/**
 * The synopsis and enrolment rules of the unit a detail panel opens
 * (and its equivalents). Every other payload leaves this prose out.
 */
export async function fetchUnitTextAction(
  codes: string[],
  year: string
): Promise<Record<string, UnitText>> {
  const y = await knownYear(year)
  const list = cleanCodes(codes, MAX_TEXT_CODES)
  if (!y || list.length === 0) return {}
  return fetchUnitText(list, y)
}

/**
 * The requisite graph for the current controls, with every unit's
 * data, offerings, structured rules and enrolment gates. The
 * handbook pages render the first paint with the same function.
 */
export async function fetchTreeDataAction(
  controls: TreeControlsValue
): Promise<TreeGraphPayload> {
  const clean = cleanTreeControls(controls, await listAvailableYears())
  return clean ? prefetchTreeData(clean) : EMPTY_TREE_PAYLOAD
}

/**
 * The prerequisite links between a fixed set of units, for the
 * planner's read-only map of a plan: no closure walk (depth 0), so
 * only the plan's own units (and any requirement units the caller
 * adds) come back, with their titles.
 */
export async function fetchPlanGraphAction(
  codes: string[],
  year: string
): Promise<{ edges: TreeEdge[]; units: Record<string, PlannerUnit> }> {
  const y = await knownYear(year)
  const unique = cleanCodes(codes, 400)
  if (!y || unique.length === 0) return { edges: [], units: {} }
  const [graph, hydrated] = await Promise.all([
    expandRequisiteGraph(unique, y, "both", 0),
    hydratePlannerUnits(unique, y),
  ])
  return {
    edges: graph.edges,
    units: Object.fromEntries(hydrated.units),
  }
}

/* ------------------------------------------------------------------ *
 * Per-user plan persistence (multi-plan)
 *
 * Only signed-in users can persist. The client falls back to
 * localStorage for anonymous visitors — see PlannerProvider for the
 * policy. Every mutation is gated by ownership: a planId from one user
 * cannot read or write another user's plan even if guessed. States are
 * checked by isPlannerState; an account holds at most
 * MAX_PLANS_PER_USER plans.
 * ------------------------------------------------------------------ */

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "invalid" | "not_found" }

const isPlanId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 64

export async function listMyPlansAction(): Promise<PlanSummary[]> {
  const claims = await getClaims()
  if (!claims) return []
  return listUserPlans(claims.macUserId)
}

export async function getMyPlanAction(
  planId: string
): Promise<{ id: string; name: string; state: PlannerState } | null> {
  const claims = await getClaims()
  if (!claims || !isPlanId(planId)) return null
  return getUserPlanById(planId, claims.macUserId)
}

export async function saveMyPlanAction(
  planId: string,
  state: PlannerState
): Promise<SaveResult> {
  const claims = await getClaims()
  if (!claims) return { ok: false, reason: "unauthenticated" }
  if (!isPlanId(planId) || !isPlannerState(state))
    return { ok: false, reason: "invalid" }
  const ok = await updateUserPlanState(planId, claims.macUserId, state)
  return ok ? { ok: true } : { ok: false, reason: "not_found" }
}

export async function createMyPlanAction(
  name: string,
  state: PlannerState
): Promise<
  | { ok: true; plan: { id: string; name: string } }
  | { ok: false; reason: "unauthenticated" | "invalid" | "limit" }
> {
  const u = await getCurrentUser()
  if (!u) return { ok: false, reason: "unauthenticated" }
  if (!isPlannerState(state)) return { ok: false, reason: "invalid" }
  if ((await countUserPlans(u.id)) >= MAX_PLANS_PER_USER)
    return { ok: false, reason: "limit" }
  const plan = await createUserPlan(
    u.id,
    cleanPlanName(name) ?? "My plan",
    state
  )
  return { ok: true, plan }
}

/**
 * Creates a fresh plan and redirects into it. Two entry points:
 *   - No FormData (or no `year` field) → "Default plan", latest year.
 *     Used for the user's first plan, where there is nothing to choose
 *     between yet.
 *   - FormData with `year` (and optional `name`) → caller-chosen year.
 *     Used once the user already has plans, so subsequent plans don't
 *     silently inherit the latest handbook year.
 * At the plan limit it goes back to /plans, which explains why.
 */
export async function createBlankPlanAction(
  formData?: FormData
): Promise<never> {
  const u = await getCurrentUser()
  if (!u) redirect("/sign-in")
  if ((await countUserPlans(u.id)) >= MAX_PLANS_PER_USER)
    redirect("/plans?error=limit")
  const availableYears = await listAvailableYears()
  const year =
    cleanYear(formData?.get("year")?.toString(), availableYears) ??
    availableYears.at(-1)
  if (!year) throw new Error("No handbook years are loaded")
  const name =
    cleanPlanName(formData?.get("name")?.toString()) ?? "Default plan"
  const state = defaultState(year, null, 3)
  const plan = await createUserPlan(u.id, name, state)
  const posthog = getPostHogClient()
  posthog.capture({
    distinctId: u.id,
    event: "plan_created_server",
    properties: { handbook_year: year },
  })
  await posthog.flush()
  redirect(`/?plan=${plan.id}`)
}

export async function renameMyPlanAction(
  planId: string,
  name: string
): Promise<SaveResult> {
  const claims = await getClaims()
  if (!claims) return { ok: false, reason: "unauthenticated" }
  const trimmed = cleanPlanName(name)
  if (!isPlanId(planId) || !trimmed) return { ok: false, reason: "invalid" }
  const ok = await renameUserPlan(planId, claims.macUserId, trimmed)
  return ok ? { ok: true } : { ok: false, reason: "not_found" }
}

export async function deleteMyPlanAction(planId: string): Promise<SaveResult> {
  const claims = await getClaims()
  if (!claims) return { ok: false, reason: "unauthenticated" }
  if (!isPlanId(planId)) return { ok: false, reason: "invalid" }
  const ok = await deleteUserPlan(planId, claims.macUserId)
  return ok ? { ok: true } : { ok: false, reason: "not_found" }
}

export async function duplicateMyPlanAction(
  planId: string
): Promise<
  | { ok: true; plan: { id: string; name: string } }
  | { ok: false; reason: "unauthenticated" | "not_found" | "limit" }
> {
  const claims = await getClaims()
  if (!claims) return { ok: false, reason: "unauthenticated" }
  if (!isPlanId(planId)) return { ok: false, reason: "not_found" }
  if ((await countUserPlans(claims.macUserId)) >= MAX_PLANS_PER_USER)
    return { ok: false, reason: "limit" }
  const plan = await duplicateUserPlan(planId, claims.macUserId)
  return plan ? { ok: true, plan } : { ok: false, reason: "not_found" }
}

/* ------------------------------------------------------------------ *
 * Per-user grades (account-global)
 *
 * An account holds at most MAX_GRADES_PER_USER grades. Changing an
 * existing grade always works.
 * ------------------------------------------------------------------ */

export async function listMyGradesAction(): Promise<Record<string, number>> {
  const claims = await getClaims()
  if (!claims) return {}
  return listUserGrades(claims.macUserId)
}

export async function listMyGradesWithTitlesAction(): Promise<
  UserGradeWithTitle[]
> {
  const claims = await getClaims()
  if (!claims) return []
  return listUserGradesWithTitles(claims.macUserId)
}

export async function setMyGradeAction(
  unitCode: string,
  mark: number | null
): Promise<SaveResult> {
  const u = await getCurrentUser()
  if (!u) return { ok: false, reason: "unauthenticated" }
  const code = cleanGradeCode(unitCode)
  if (!code) return { ok: false, reason: "invalid" }
  if (mark === null) {
    await deleteUserGrade(u.id, code)
    return { ok: true }
  }
  const clean = cleanMark(mark)
  if (clean === null) return { ok: false, reason: "invalid" }
  const existing = await listUserGrades(u.id)
  if (
    existing[code] === undefined &&
    Object.keys(existing).length >= MAX_GRADES_PER_USER
  )
    return { ok: false, reason: "invalid" }
  await upsertUserGrade(u.id, code, clean)
  return { ok: true }
}

/**
 * Used during the localStorage → server migration on first sign-in.
 * Anything already on the server wins (no clobber); only codes the user
 * doesn't have a server-side grade for get inserted, up to the limit.
 */
export async function migrateMyGradesAction(
  grades: Record<string, number>
): Promise<{ ok: boolean }> {
  const u = await getCurrentUser()
  if (!u) return { ok: false }
  if (!grades || typeof grades !== "object") return { ok: false }
  const existing = await listUserGrades(u.id)
  let room = MAX_GRADES_PER_USER - Object.keys(existing).length
  const toInsert: Record<string, number> = {}
  for (const [rawCode, rawMark] of Object.entries(grades)) {
    if (room <= 0) break
    const code = cleanGradeCode(rawCode)
    const mark = cleanMark(rawMark)
    if (!code || mark === null) continue
    if (existing[code] !== undefined || toInsert[code] !== undefined) continue
    toInsert[code] = mark
    room--
  }
  if (Object.keys(toInsert).length > 0) {
    await bulkUpsertUserGrades(u.id, toInsert)
  }
  return { ok: true }
}
