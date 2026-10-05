/**
 * Checks for the arguments of the public server actions in
 * app/actions.ts. Server actions are POST endpoints anyone can call
 * with any JSON, and most of their reads are memoised per argument
 * list (memo.ts), so junk input must be dropped before it reaches a
 * query or becomes a cache key. Pure, so it is tested without a
 * database.
 */
import type { PlannerState } from "../planner/types.ts"
import type { TreeControlsValue } from "../tree/payload.ts"
import type { TreeDirection } from "../tree/types.ts"

/**
 * Unit and course codes as Monash writes them (FIT1045, C2001). One
 * combined course is coded "M6011 M6019", hence the space.
 */
const CODE = /^[A-Z0-9][A-Z0-9 -]{1,23}$/
/** AoS codes, plus the virtual `C2001:part-d:slug` ones. */
const AOS_CODE = /^[A-Za-z0-9:_.-]{2,160}$/

/**
 * The most codes one hydrate call takes. The largest real course load
 * is about 813 unit codes (E3002, every AoS unit), so this leaves room
 * without letting one call read a whole handbook year.
 */
export const MAX_HYDRATE_CODES = 3000
/** Characters of search text kept; /search uses the same limit. */
export const MAX_QUERY_LENGTH = 100
/** Saved plans per account. */
export const MAX_PLANS_PER_USER = 50
/** Grade rows per account; a degree is 24-48 units. */
export const MAX_GRADES_PER_USER = 500
/** Serialised size of one plan. Real plans are a few KB. */
export const MAX_PLAN_STATE_CHARS = 100_000

export function isCode(v: unknown): v is string {
  return typeof v === "string" && CODE.test(v)
}

/** `v` when it is one of the handbook years in the database. */
export function cleanYear(v: unknown, years: readonly string[]): string | null {
  return typeof v === "string" && years.includes(v) ? v : null
}

/**
 * The valid codes in `v`, deduplicated and sorted (a stable memo key),
 * at most `max`. Invalid entries are dropped, not rewritten: the
 * planner matches results back to the codes it sent.
 */
export function cleanCodes(v: unknown, max = MAX_HYDRATE_CODES): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter(isCode))].sort().slice(0, max)
}

/**
 * `{ year: codes }` keeping only known years, with at most `max` codes
 * across all of them.
 */
export function cleanCodesByYear(
  v: unknown,
  years: readonly string[],
  max = MAX_HYDRATE_CODES
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!v || typeof v !== "object" || Array.isArray(v)) return out
  let left = max
  for (const [year, codes] of Object.entries(v)) {
    if (!cleanYear(year, years) || left <= 0) continue
    const list = cleanCodes(codes, left)
    if (list.length === 0) continue
    out.set(year, list)
    left -= list.length
  }
  return out
}

/** Search text, trimmed and cut to `MAX_QUERY_LENGTH`. */
export function cleanQuery(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_QUERY_LENGTH) : ""
}

/** A plan name, trimmed and cut to 80 characters; null when empty. */
export function cleanPlanName(v: unknown): string | null {
  if (typeof v !== "string") return null
  return v.trim().slice(0, 80) || null
}

/** A mark from 0 to 100, rounded; null when it is not one. */
export function cleanMark(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100)
    return null
  return Math.round(v)
}

/** A unit code for a grade, upper-cased; null when it is not one. */
export function cleanGradeCode(v: unknown): string | null {
  if (typeof v !== "string") return null
  const code = v.trim().toUpperCase()
  return isCode(code) ? code : null
}

const DIRECTIONS: readonly TreeDirection[] = ["upstream", "downstream", "both"]

/** Requisite-graph controls with known values, or null. */
export function cleanTreeControls(
  v: unknown,
  years: readonly string[]
): TreeControlsValue | null {
  if (!v || typeof v !== "object") return null
  const c = v as Record<string, unknown>
  const year = cleanYear(c.year, years)
  if (!year) return null
  if (c.mode !== "course" && c.mode !== "unit") return null
  if (!DIRECTIONS.includes(c.direction as TreeDirection)) return null
  const code = (x: unknown) => (isCode(x) ? x : null)
  return {
    mode: c.mode,
    direction: c.direction as TreeDirection,
    year,
    courseCode: code(c.courseCode),
    unitCode: code(c.unitCode),
    aosCode:
      typeof c.aosCode === "string" && AOS_CODE.test(c.aosCode)
        ? c.aosCode
        : null,
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)
const optional = (v: unknown, type: "string" | "number" | "boolean") =>
  v === undefined || v === null || typeof v === type
const PERIOD_KINDS = new Set([
  "S1",
  "S2",
  "SUMMER_A",
  "SUMMER_B",
  "WINTER",
  "FULL_YEAR",
  "OTHER",
])

/**
 * Whether `v` has the shape of a PlannerState (packages/db
 * planner-state.ts) and a sane size. The checks are structural and
 * generous: the reducer has no limit on years, and a rejected save
 * leaves the student's plan unsaved, so the caps sit far above
 * anything the UI makes. Unknown keys are allowed, so a field added
 * later is not silently refused.
 */
export function isPlannerState(v: unknown): v is PlannerState {
  if (!isObj(v)) return false
  if (typeof v.courseYear !== "string" || !/^\d{4}$/.test(v.courseYear))
    return false
  if (v.courseCode !== null && typeof v.courseCode !== "string") return false
  if (!optional(v.startPeriod, "string") || !optional(v.setupDone, "boolean"))
    return false
  if (!optional(v.campus, "string")) return false
  // Plans saved by early versions hold booleans here too.
  if (!isObj(v.selectedAos)) return false
  if (
    Object.values(v.selectedAos).some(
      (x) => x !== null && typeof x === "object"
    )
  )
    return false
  if (!Array.isArray(v.years) || v.years.length > 30) return false
  for (const y of v.years) {
    if (!isObj(y) || !optional(y.label, "string")) return false
    // Stored plans have years with 13 "Other" periods.
    if (!Array.isArray(y.slots) || y.slots.length > 40) return false
    for (const s of y.slots) {
      if (!isObj(s) || !PERIOD_KINDS.has(s.kind as string)) return false
      if (!Array.isArray(s.unitCodes) || s.unitCodes.length > 24) return false
      if (!s.unitCodes.every((c) => typeof c === "string")) return false
      if (!optional(s.capacity, "number") || !optional(s.label, "string"))
        return false
      if (!optional(s.locked, "boolean") || !optional(s.creditPoints, "number"))
        return false
      if (s.status != null && s.status !== "leave" && s.status !== "exchange")
        return false
    }
  }
  if (v.credit !== undefined) {
    if (!Array.isArray(v.credit) || v.credit.length > 50) return false
    for (const e of v.credit) {
      if (!isObj(e) || typeof e.creditPoints !== "number") return false
      if (e.code !== null && typeof e.code !== "string") return false
      if (!optional(e.label, "string")) return false
    }
  }
  return JSON.stringify(v).length <= MAX_PLAN_STATE_CHARS
}
