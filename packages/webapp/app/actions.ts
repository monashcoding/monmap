"use server"

import { getClaims, getCurrentUser } from "@/lib/auth-server"
import { captureServer } from "@/lib/posthog-server"
import {
  cleanGradeCode,
  cleanMark,
  cleanPlanName,
  cleanYear,
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
  getUserPlanById,
  listAvailableYears,
  listUserGrades,
  listUserGradesWithTitles,
  listUserPlans,
  type PlanSummary,
  type UserGradeWithTitle,
  renameUserPlan,
  updateUserPlanState,
  upsertUserGrade,
} from "@/lib/db/queries"
export type { PlanSummary, UserGradeWithTitle } from "@/lib/db/queries"
import type { PlannerState } from "@/lib/planner/types"
import { defaultState } from "@/lib/planner/state"
import { redirect } from "next/navigation"

/*
 * Every export here is a public POST endpoint that anyone can call with
 * any arguments, so each one checks its input (lib/db/input.ts) before
 * it queries. These are the writes and the per-user reads; the public
 * handbook reads are GET routes under app/api, which the browser can
 * cache and run in parallel.
 */

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
  await captureServer(u.id, "plan_created_server", { handbook_year: year })
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
