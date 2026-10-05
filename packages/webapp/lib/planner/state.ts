import { slotTakesUnits } from "./capacity.ts"
import { countFullYearPrefix } from "./full-year.ts"
import {
  DEFAULT_SLOT_CAPACITY,
  MAX_SLOT_CAPACITY,
  slotCapacity,
  type PeriodKind,
  type PlannerCreditEntry,
  type PlannerSlot,
  type PlannerState,
  type PlannerYear,
} from "./types.ts"
import {
  primaryOrder,
  sortSlots,
  startPeriodOf,
  type StartPeriod,
} from "./timeline.ts"

/**
 * Pure reducer + factory functions for PlannerState. Keeping these
 * pure lets the UI derive state transitions by applying actions and
 * lets tests exercise planner mutations without rendering anything.
 */

export function defaultState(
  courseYear: string,
  courseCode: string | null,
  yearCount = 3
): PlannerState {
  return {
    courseYear,
    courseCode,
    selectedAos: {},
    years: Array.from({ length: yearCount }, (_, i) => defaultYear(i + 1)),
  }
}

/**
 * A study year with its two semesters in intake order. `only: "first"`
 * gives just the first semester, for a plan that finishes mid-year.
 */
export function defaultYear(
  nth: number,
  start: StartPeriod = "S1",
  only?: "first"
): PlannerYear {
  const kinds = primaryOrder(start).slice(0, only === "first" ? 1 : 2)
  return {
    label: `Year ${nth}`,
    slots: kinds.map((kind) => ({
      kind,
      unitCodes: [],
      capacity: DEFAULT_SLOT_CAPACITY,
    })),
  }
}

/** A new year shaped by the plan's intake. */
function yearFor(
  state: PlannerState,
  nth: number,
  only?: "first"
): PlannerYear {
  return defaultYear(nth, startPeriodOf(state), only)
}

export type PlannerAction =
  | { type: "set_course"; code: string | null }
  | { type: "set_year"; year: string }
  | {
      type: "set_aos"
      /** A `selectedAos` slot key — fixed role or "<kind>@<scope>". */
      role: string
      code: string | null
      /**
       * Slot keys to delete in the same step — used when a scoped slot
       * write supersedes a legacy fixed-role value so the old pick
       * doesn't resurface as the slot's fallback.
       */
      alsoClear?: readonly string[]
    }
  | { type: "set_campus"; campus: string | null }
  | { type: "add_credit"; entry: PlannerCreditEntry }
  | { type: "remove_credit"; index: number }
  | { type: "add_unit"; yearIndex: number; slotIndex: number; code: string }
  | { type: "remove_unit"; yearIndex: number; slotIndex: number; code: string }
  | {
      type: "move_unit"
      fromYearIndex: number
      fromSlotIndex: number
      toYearIndex: number
      toSlotIndex: number
      code: string
    }
  | {
      type: "swap_units"
      a: { yearIndex: number; slotIndex: number; code: string }
      b: { yearIndex: number; slotIndex: number; code: string }
    }
  /**
   * Place a full-year unit into a year. The reducer puts it at the
   * next FY position in *both* S1 and S2 of that year, shifting any
   * existing non-FY units rightward. `fullYearCodes` lists every FY
   * code currently anywhere in the plan so the reducer can compute
   * the prefix length without recomputing from offerings.
   */
  | {
      type: "add_full_year_unit"
      yearIndex: number
      code: string
      fullYearCodes: ReadonlyArray<string>
    }
  /**
   * Remove a FY unit — strips both S1 and S2. With `yearIndex`, only
   * that year, so a retake in another year survives; without it, every
   * year.
   */
  | { type: "remove_full_year_unit"; code: string; yearIndex?: number }
  /**
   * Move a FY unit between years: strips both halves in
   * `fromYearIndex` and inserts into `toYearIndex` at the next FY
   * position. When the years are the same it is a reorder: the unit
   * takes `targetCode`'s position in both halves, as in a sortable
   * list, or goes to the end of the FY prefix without a target.
   */
  | {
      type: "move_full_year_unit"
      fromYearIndex: number
      toYearIndex: number
      code: string
      fullYearCodes: ReadonlyArray<string>
      targetCode?: string
    }
  /**
   * Repair a FY unit that sits in only one half of a year (its
   * offerings loaded after it was placed): strip it from that year's
   * S1 and S2 and put it at the FY prefix of both. historyReducer
   * applies this to the present state without an undo step, since it
   * is a data repair rather than a student's edit.
   */
  | {
      type: "heal_full_year_unit"
      yearIndex: number
      code: string
      fullYearCodes: ReadonlyArray<string>
    }
  | {
      type: "bulk_load"
      placements: ReadonlyArray<{
        yearIndex: number
        slotIndex: number
        code: string
      }>
      mode: "merge" | "replace"
    }
  | { type: "add_year"; only?: "first" }
  | { type: "set_start_period"; period: StartPeriod }
  | { type: "complete_setup" }
  | {
      type: "set_slot_status"
      yearIndex: number
      slotIndex: number
      status: "leave" | "exchange" | null
    }
  | {
      type: "set_slot_credit"
      yearIndex: number
      slotIndex: number
      creditPoints: number
    }
  | { type: "remove_year"; yearIndex: number }
  | { type: "set_year_count"; count: number }
  | {
      type: "add_optional_slot"
      yearIndex: number
      kind: PeriodKind
      label?: string
    }
  | { type: "remove_slot"; yearIndex: number; slotIndex: number }
  | {
      type: "set_slot_capacity"
      yearIndex: number
      slotIndex: number
      capacity: number
    }
  | { type: "clear_slot"; yearIndex: number; slotIndex: number }
  | { type: "clear_year"; yearIndex: number }
  | { type: "rename_slot"; yearIndex: number; slotIndex: number; label: string }
  | { type: "toggle_slot_lock"; yearIndex: number; slotIndex: number }
  | { type: "reset"; yearCount?: number }
  | { type: "hydrate"; state: PlannerState }
  /** Several actions as one edit, so one undo reverts them all. */
  | { type: "batch"; actions: ReadonlyArray<PlannerAction> }

export function plannerReducer(
  state: PlannerState,
  action: PlannerAction
): PlannerState {
  switch (action.type) {
    case "set_course":
      if (state.courseCode === action.code) return state
      return {
        ...state,
        courseCode: action.code,
        // Clear AoS selections when course changes — the prior picks
        // are almost certainly invalid for the new course.
        selectedAos: {},
      }

    case "set_year":
      if (state.courseYear === action.year) return state
      return {
        ...state,
        courseYear: action.year,
        selectedAos: {},
        years: state.years.map(withoutUnits),
      }

    case "set_aos": {
      const next = { ...state.selectedAos }
      for (const k of action.alsoClear ?? []) delete next[k]
      if (!action.code) delete next[action.role]
      else next[action.role] = action.code
      return { ...state, selectedAos: next }
    }

    case "set_campus": {
      if ((state.campus ?? null) === action.campus) return state
      const next = { ...state }
      // Deliberately does not touch selectedAos: a pick that falls out
      // of scope is flagged in the picker, not deleted. Clearing it
      // would silently discard a decision the student made.
      if (!action.campus) delete next.campus
      else next.campus = action.campus
      return next
    }

    case "add_credit": {
      const entry = action.entry
      // A code can only be credited once, and crediting a unit the
      // student has also placed in a slot is a contradiction we resolve
      // by ignoring the credit — the placement is the more specific
      // statement, and validation already reasons about it.
      if (entry.code) {
        if (state.credit?.some((c) => c.code === entry.code)) return state
        const placed = state.years.some((y) =>
          y.slots.some((s) => s.unitCodes.includes(entry.code!))
        )
        if (placed) return state
      }
      return { ...state, credit: [...(state.credit ?? []), entry] }
    }

    case "remove_credit": {
      const credit = state.credit
      if (!credit || action.index < 0 || action.index >= credit.length)
        return state
      const next = credit.filter((_, i) => i !== action.index)
      return { ...state, credit: next }
    }

    case "add_unit":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) =>
        addCode(slot, action.code)
      )

    case "remove_unit":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) =>
        removeCode(slot, action.code)
      )

    case "move_unit": {
      // A locked slot keeps its units, and a locked or leave/exchange
      // slot takes none.
      const from =
        state.years[action.fromYearIndex]?.slots[action.fromSlotIndex]
      const to = state.years[action.toYearIndex]?.slots[action.toSlotIndex]
      if (!from || !to || from.locked || !slotTakesUnits(to)) return state
      const removed = withSlot(
        state,
        action.fromYearIndex,
        action.fromSlotIndex,
        (slot) => removeCode(slot, action.code)
      )
      return withSlot(removed, action.toYearIndex, action.toSlotIndex, (slot) =>
        addCode(slot, action.code)
      )
    }

    case "swap_units": {
      const { a, b } = action
      if (a.code === b.code) return state
      const aSlot = state.years[a.yearIndex]?.slots[a.slotIndex]
      const bSlot = state.years[b.yearIndex]?.slots[b.slotIndex]
      if (!aSlot || !bSlot || aSlot.locked || bSlot.locked) return state
      const aIdx = aSlot.unitCodes.indexOf(a.code)
      const bIdx = bSlot.unitCodes.indexOf(b.code)
      if (aIdx < 0 || bIdx < 0) return state
      if (a.yearIndex === b.yearIndex && a.slotIndex === b.slotIndex) {
        const next = [...aSlot.unitCodes]
        ;[next[aIdx], next[bIdx]] = [next[bIdx]!, next[aIdx]!]
        return withSlot(state, a.yearIndex, a.slotIndex, (s) => ({
          ...s,
          unitCodes: next,
        }))
      }
      const newA = [...aSlot.unitCodes]
      newA[aIdx] = b.code
      const newB = [...bSlot.unitCodes]
      newB[bIdx] = a.code
      const afterA = withSlot(state, a.yearIndex, a.slotIndex, (s) => ({
        ...s,
        unitCodes: newA,
      }))
      return withSlot(afterA, b.yearIndex, b.slotIndex, (s) => ({
        ...s,
        unitCodes: newB,
      }))
    }

    case "add_full_year_unit": {
      const year = state.years[action.yearIndex]
      if (!year) return state
      // Already in THIS year? Bail — caller should use move instead. A
      // full-year unit occupies S1+S2 of one year, so a second copy in
      // the same year is always a mistake; a copy in a *later* year is
      // a retake after a fail, which is legitimate.
      if (year.slots.some((s) => s.unitCodes.includes(action.code)))
        return state
      if (!semestersTakeUnits(year)) return state
      return mapYear(state, action.yearIndex, (y) =>
        insertFullYear(y, action.code, new Set(action.fullYearCodes))
      )
    }

    case "remove_full_year_unit": {
      let next = state
      state.years.forEach((y, yi) => {
        if (action.yearIndex !== undefined && yi !== action.yearIndex) return
        next = mapYear(next, yi, (yr) => stripFromSemesters(yr, action.code))
      })
      return next
    }

    case "move_full_year_unit": {
      const from = state.years[action.fromYearIndex]
      const to = state.years[action.toYearIndex]
      if (!from || !to) return state
      if (from.slots.some((s) => s.locked && s.unitCodes.includes(action.code)))
        return state
      if (action.fromYearIndex === action.toYearIndex)
        return mapYear(state, action.fromYearIndex, (y) =>
          reorderFullYear(
            y,
            action.code,
            action.targetCode,
            new Set(action.fullYearCodes)
          )
        )
      if (!semestersTakeUnits(to)) return state
      const stripped = mapYear(state, action.fromYearIndex, (y) =>
        stripFromSemesters(y, action.code)
      )
      return mapYear(stripped, action.toYearIndex, (y) =>
        insertFullYear(y, action.code, new Set(action.fullYearCodes))
      )
    }

    case "heal_full_year_unit": {
      const year = state.years[action.yearIndex]
      if (!year) return state
      const halves = year.slots.filter((s) => isSemester(s.kind))
      // Repair only a unit in exactly one half: none means the student
      // removed it, both means it is already twinned. A leave/exchange
      // half holds no units, so the unit stays where it is.
      if (halves.length !== 2) return state
      const holding = halves.filter((s) => s.unitCodes.includes(action.code))
      if (holding.length !== 1) return state
      if (halves.some((s) => s.status)) return state
      const fySet = new Set(action.fullYearCodes)
      return mapYear(state, action.yearIndex, (y) =>
        insertFullYear(stripFromSemesters(y, action.code), action.code, fySet)
      )
    }

    case "bulk_load": {
      let next: PlannerState =
        action.mode === "replace"
          ? { ...state, years: state.years.map(withoutUnits) }
          : state
      const maxYi = action.placements.reduce(
        (m, p) => Math.max(m, p.yearIndex),
        -1
      )
      while (next.years.length <= maxYi) {
        next = {
          ...next,
          years: [...next.years, yearFor(next, next.years.length + 1)],
        }
      }
      for (const p of action.placements)
        next = withSlot(next, p.yearIndex, p.slotIndex, (slot) =>
          addCode(slot, p.code)
        )
      return next
    }

    case "add_year":
      return {
        ...state,
        years: [
          ...state.years,
          yearFor(state, state.years.length + 1, action.only),
        ],
      }

    case "set_start_period": {
      if (startPeriodOf(state) === action.period) return state
      // Units stay in their slots (an S1 unit is still an S1 unit); only
      // the order within each study year and the calendar years change.
      return {
        ...state,
        startPeriod: action.period === "S2" ? "S2" : undefined,
        years: state.years.map((y) => ({
          ...y,
          slots: sortSlots(y.slots, action.period),
        })),
      }
    }

    case "complete_setup":
      return state.setupDone ? state : { ...state, setupDone: true }

    case "set_slot_status": {
      const year = state.years[action.yearIndex]
      const target = year?.slots[action.slotIndex]
      if (!year || !target) return state
      const status = action.status ?? undefined
      if (target.status === status) return state
      // Leave and exchange periods hold no units. Clearing a semester
      // also drops the other half of any full-year unit in it.
      const cleared = status ? new Set(target.unitCodes) : null
      return {
        ...state,
        years: state.years.map((y, yi) =>
          yi !== action.yearIndex
            ? y
            : {
                ...y,
                slots: y.slots.map((s, si) => {
                  if (si === action.slotIndex) {
                    const next: PlannerSlot = {
                      ...s,
                      status,
                      unitCodes: status ? [] : s.unitCodes,
                    }
                    if (status === "exchange")
                      next.creditPoints = s.creditPoints ?? 24
                    else delete next.creditPoints
                    if (!status) delete next.status
                    return next
                  }
                  if (!cleared || cleared.size === 0) return s
                  if (s.kind !== twinKind(target.kind)) return s
                  return {
                    ...s,
                    unitCodes: s.unitCodes.filter((c) => !cleared.has(c)),
                  }
                }),
              }
        ),
      }
    }

    case "set_slot_credit":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => {
        if (slot.status !== "exchange") return slot
        const cp = Math.min(48, Math.max(0, Math.round(action.creditPoints)))
        if (slot.creditPoints === cp) return slot
        return { ...slot, creditPoints: cp }
      })

    case "remove_year":
      if (state.years.length <= 1) return state
      return {
        ...state,
        years: state.years
          .filter((_, i) => i !== action.yearIndex)
          .map((y, i) => ({ ...y, label: `Year ${i + 1}` })),
      }

    case "set_year_count": {
      const target = Math.max(1, action.count)
      if (state.years.length === target) return state
      if (state.years.length < target) {
        const added = Array.from(
          { length: target - state.years.length },
          (_, i) => yearFor(state, state.years.length + i + 1)
        )
        return { ...state, years: [...state.years, ...added] }
      }
      // Never drop a year that has units or a leave/exchange semester:
      // shrink only as far as the last year in use.
      let lastUsed = -1
      state.years.forEach((y, i) => {
        if (y.slots.some((s) => s.unitCodes.length > 0 || s.status))
          lastUsed = i
      })
      const keep = Math.max(target, lastUsed + 1)
      if (keep === state.years.length) return state
      return { ...state, years: state.years.slice(0, keep) }
    }

    case "add_optional_slot": {
      const year = state.years[action.yearIndex]
      if (!year) return state
      // OTHER kind is used for freeform "Untitled" sections — allow multiples.
      if (
        action.kind !== "OTHER" &&
        year.slots.some((s) => s.kind === action.kind)
      )
        return state
      const newSlot: PlannerSlot = {
        kind: action.kind,
        unitCodes: [],
        label: action.label,
      }
      return {
        ...state,
        years: state.years.map((y, i) =>
          i === action.yearIndex
            ? {
                ...y,
                slots: sortSlots([...y.slots, newSlot], startPeriodOf(state)),
              }
            : y
        ),
      }
    }

    case "remove_slot": {
      const year = state.years[action.yearIndex]
      if (!year) return state
      const target = year.slots[action.slotIndex]
      if (!target) return state
      // Removing S1 or S2 from a year orphans any full-year unit that
      // had its other half in that year. A FY twin is, by construction,
      // a code that appears in both S1 and S2 of the same year — strip
      // any such codes from the surviving half before deleting the slot.
      const twin = twinKind(target.kind)
      const orphanedFy = new Set(
        target.unitCodes.filter((c) =>
          year.slots.some((s) => s.kind === twin && s.unitCodes.includes(c))
        )
      )
      return mapYear(state, action.yearIndex, (y) => ({
        ...y,
        slots: y.slots
          .filter((_, si) => si !== action.slotIndex)
          .map((s) => {
            if (s.kind !== twin) return s
            if (!s.unitCodes.some((c) => orphanedFy.has(c))) return s
            return {
              ...s,
              unitCodes: s.unitCodes.filter((c) => !orphanedFy.has(c)),
            }
          }),
      }))
    }

    case "set_slot_capacity":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => {
        // Keep capacity within [already-placed units, MAX]; a student
        // can't shrink below the units they've already placed.
        const floor = Math.max(1, slot.unitCodes.length)
        const next = Math.min(
          MAX_SLOT_CAPACITY,
          Math.max(floor, action.capacity)
        )
        if (slotCapacity(slot) === next) return slot
        return { ...slot, capacity: next }
      })

    case "clear_slot":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => {
        if (slot.unitCodes.length === 0) return slot
        return { ...slot, unitCodes: [] }
      })

    case "clear_year":
      return mapYear(state, action.yearIndex, withoutUnits)

    case "rename_slot":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => {
        const label = action.label.trim() || undefined
        if (slot.label === label) return slot
        return { ...slot, label }
      })

    case "toggle_slot_lock":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => ({
        ...slot,
        locked: !slot.locked,
      }))

    case "reset": {
      const yearCount = action.yearCount ?? state.years.length
      return {
        ...state,
        years: Array.from({ length: yearCount }, (_, i) =>
          yearFor(state, i + 1)
        ),
      }
    }

    case "hydrate":
      return normalizeTimeline(action.state)

    case "batch":
      return action.actions.reduce(plannerReducer, state)
  }
}

/**
 * Cap on the past/future stacks. Bounded so a long editing session
 * can't grow the in-memory history unboundedly; 50 covers any
 * realistic undo depth a student would actually reach for.
 */
export const HISTORY_LIMIT = 50

export interface HistoryState {
  past: PlannerState[]
  present: PlannerState
  future: PlannerState[]
}

export type HistoryAction = { type: "undo" } | { type: "redo" } | PlannerAction

export function initialHistory(present: PlannerState): HistoryState {
  return { past: [], present, future: [] }
}

/**
 * Reducer wrapper that records past/future snapshots around the pure
 * planner reducer so the UI can offer undo/redo.
 *
 * Three non-obvious rules:
 *   - `hydrate` clears history. Hydration is how plan-switching and
 *     server-load land state; preserving history across it would let
 *     "undo" surface state from a *different* plan (cross-plan leak)
 *     or push state back to the wrong record on save.
 *   - Actions that the inner reducer treats as no-ops (returns the
 *     same reference) don't take a history slot. Otherwise idempotent
 *     dispatches would silently consume undo depth.
 *   - `heal_full_year_unit` changes the present without a history
 *     slot. It runs from an effect after data loads; as an undo step,
 *     undoing it would bring back the half-placed unit, the effect
 *     would heal it again and clear redo, and undo could never get
 *     past the add.
 */
export function historyReducer(
  history: HistoryState,
  action: HistoryAction
): HistoryState {
  switch (action.type) {
    case "undo": {
      const prev = history.past[history.past.length - 1]
      if (!prev) return history
      return {
        past: history.past.slice(0, -1),
        present: prev,
        future: [history.present, ...history.future],
      }
    }
    case "redo": {
      const next = history.future[0]
      if (!next) return history
      return {
        past: [...history.past, history.present],
        present: next,
        future: history.future.slice(1),
      }
    }
    case "hydrate": {
      return initialHistory(normalizeTimeline(action.state))
    }
    case "heal_full_year_unit": {
      const present = plannerReducer(history.present, action)
      if (present === history.present) return history
      return { ...history, present }
    }
    default: {
      const next = plannerReducer(history.present, action)
      if (next === history.present) return history
      const past =
        history.past.length >= HISTORY_LIMIT
          ? [...history.past.slice(1), history.present]
          : [...history.past, history.present]
      return { past, present: next, future: [] }
    }
  }
}

function isSemester(kind: PeriodKind): kind is "S1" | "S2" {
  return kind === "S1" || kind === "S2"
}

/** The other half of a full-year pair: S1 ↔ S2, else null. */
function twinKind(kind: PeriodKind): "S1" | "S2" | null {
  return kind === "S1" ? "S2" : kind === "S2" ? "S1" : null
}

function addCode(slot: PlannerSlot, code: string): PlannerSlot {
  if (!slotTakesUnits(slot) || slot.unitCodes.includes(code)) return slot
  return { ...slot, unitCodes: [...slot.unitCodes, code] }
}

function removeCode(slot: PlannerSlot, code: string): PlannerSlot {
  if (!slot.unitCodes.includes(code)) return slot
  return { ...slot, unitCodes: slot.unitCodes.filter((c) => c !== code) }
}

function withoutUnits(year: PlannerYear): PlannerYear {
  return { ...year, slots: year.slots.map((s) => ({ ...s, unitCodes: [] })) }
}

/** True when both of the year's semesters exist and can take units. */
function semestersTakeUnits(year: PlannerYear): boolean {
  const halves = year.slots.filter((s) => isSemester(s.kind))
  return halves.length === 2 && halves.every(slotTakesUnits)
}

/**
 * Apply `fn` to one year's S1 and S2. Returns the same year when no
 * slot changes, so no-op edits keep their identity.
 */
function mapSemesters(
  year: PlannerYear,
  fn: (slot: PlannerSlot) => PlannerSlot
): PlannerYear {
  let changed = false
  const slots = year.slots.map((s) => {
    if (!isSemester(s.kind)) return s
    const next = fn(s)
    if (next !== s) changed = true
    return next
  })
  return changed ? { ...year, slots } : year
}

function stripFromSemesters(year: PlannerYear, code: string): PlannerYear {
  return mapSemesters(year, (s) => removeCode(s, code))
}

/** Put a FY unit at the end of the FY prefix of both semesters. */
function insertFullYear(
  year: PlannerYear,
  code: string,
  fullYearCodes: ReadonlySet<string>
): PlannerYear {
  return mapSemesters(year, (s) => {
    if (s.unitCodes.includes(code)) return s
    const next = [...s.unitCodes]
    next.splice(countFullYearPrefix(s.unitCodes, fullYearCodes), 0, code)
    return { ...s, unitCodes: next }
  })
}

/**
 * Same-year FY reorder. In each semester the unit moves to
 * `targetCode`'s index; without a FY target there, it is stripped and
 * reinserted at the end of the FY prefix, so it never leaves the
 * prefix. Other years are untouched, so a retake elsewhere survives.
 */
function reorderFullYear(
  year: PlannerYear,
  code: string,
  targetCode: string | undefined,
  fullYearCodes: ReadonlySet<string>
): PlannerYear {
  return mapSemesters(year, (s) => {
    const from = s.unitCodes.indexOf(code)
    if (from < 0) return s
    const to =
      targetCode && fullYearCodes.has(targetCode)
        ? s.unitCodes.indexOf(targetCode)
        : -1
    const next = s.unitCodes.filter((c) => c !== code)
    next.splice(
      to >= 0 ? to : countFullYearPrefix(next, fullYearCodes),
      0,
      code
    )
    return next.every((c, i) => c === s.unitCodes[i])
      ? s
      : { ...s, unitCodes: next }
  })
}

/**
 * Apply `fn` to one year. Returns the same state when the year is
 * missing or `fn` returns it unchanged.
 */
function mapYear(
  state: PlannerState,
  yearIndex: number,
  fn: (year: PlannerYear) => PlannerYear
): PlannerState {
  const year = state.years[yearIndex]
  if (!year) return state
  const next = fn(year)
  if (next === year) return state
  return {
    ...state,
    years: state.years.map((y, yi) => (yi === yearIndex ? next : y)),
  }
}

function withSlot(
  state: PlannerState,
  yearIndex: number,
  slotIndex: number,
  fn: (slot: PlannerSlot) => PlannerSlot
): PlannerState {
  const year = state.years[yearIndex]
  if (!year) return state
  const slot = year.slots[slotIndex]
  if (!slot) return state
  const nextSlot = fn(slot)
  // Preserve identity on no-op edits. Callers (like add_unit on a code
  // that's already there) commonly return the same slot reference, and
  // the history wrapper uses === on the result to decide whether the
  // action took a stack slot.
  if (nextSlot === slot) return state
  return mapYear(state, yearIndex, (y) => ({
    ...y,
    slots: y.slots.map((s, si) => (si !== slotIndex ? s : nextSlot)),
  }))
}

/**
 * Put every year's slots in chronological order for the plan's intake.
 * Plans saved before the timeline model appended Winter and Summer
 * after Semester 2; this moves Winter between the semesters, where it
 * runs. Returns the same object when nothing moves.
 */
export function normalizeTimeline(state: PlannerState): PlannerState {
  const start = startPeriodOf(state)
  let changed = false
  const years = state.years.map((y) => {
    const sorted = sortSlots(y.slots, start)
    if (sorted.every((s, i) => s === y.slots[i])) return y
    changed = true
    return { ...y, slots: sorted }
  })
  return changed ? { ...state, years } : state
}
