import {
  DEFAULT_SLOT_CAPACITY,
  MAX_SLOT_CAPACITY,
  slotCapacity,
  type PeriodKind,
  type PlannerSlot,
  type PlannerState,
  type PlannerYear,
} from "./types.ts"
import { PRIMARY_SLOT_KINDS } from "./teaching-period.ts"

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

export function defaultYear(nth: number): PlannerYear {
  return {
    label: `Year ${nth}`,
    slots: PRIMARY_SLOT_KINDS.map((kind) => ({
      kind,
      unitCodes: [],
      capacity: DEFAULT_SLOT_CAPACITY,
    })),
  }
}

export type PlannerAction =
  | { type: "set_course"; code: string | null }
  | { type: "set_year"; year: string }
  | {
      type: "set_aos"
      role: keyof PlannerState["selectedAos"]
      code: string | null
    }
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
  /** Remove a FY unit from wherever it lives — strips both S1 and S2. */
  | { type: "remove_full_year_unit"; code: string }
  /**
   * Move a FY unit between years. Removes from `fromYearIndex` (both
   * halves) and inserts into `toYearIndex` at the next FY position.
   */
  | {
      type: "move_full_year_unit"
      fromYearIndex: number
      toYearIndex: number
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
  | { type: "add_year" }
  | { type: "remove_year"; yearIndex: number }
  | { type: "add_optional_slot"; yearIndex: number; kind: PeriodKind }
  | { type: "remove_slot"; yearIndex: number; slotIndex: number }
  | {
      type: "set_slot_capacity"
      yearIndex: number
      slotIndex: number
      capacity: number
    }
  | { type: "reset"; yearCount?: number }
  | { type: "hydrate"; state: PlannerState }

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
        // AoS codes are year-scoped — clear them when switching years
        // since the prior picks may not exist in the target handbook.
        selectedAos: {},
      }

    case "set_aos": {
      const next = { ...state.selectedAos }
      if (!action.code) delete next[action.role]
      else next[action.role] = action.code
      return { ...state, selectedAos: next }
    }

    case "add_unit":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => {
        if (slot.unitCodes.includes(action.code)) return slot
        return { ...slot, unitCodes: [...slot.unitCodes, action.code] }
      })

    case "remove_unit":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => ({
        ...slot,
        unitCodes: slot.unitCodes.filter((c) => c !== action.code),
      }))

    case "move_unit": {
      const removed = withSlot(
        state,
        action.fromYearIndex,
        action.fromSlotIndex,
        (slot) => ({
          ...slot,
          unitCodes: slot.unitCodes.filter((c) => c !== action.code),
        })
      )
      return withSlot(
        removed,
        action.toYearIndex,
        action.toSlotIndex,
        (slot) => {
          if (slot.unitCodes.includes(action.code)) return slot
          return { ...slot, unitCodes: [...slot.unitCodes, action.code] }
        }
      )
    }

    case "swap_units": {
      const { a, b } = action
      if (a.code === b.code) return state
      const aSlot = state.years[a.yearIndex]?.slots[a.slotIndex]
      const bSlot = state.years[b.yearIndex]?.slots[b.slotIndex]
      if (!aSlot || !bSlot) return state
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
      const fySet = new Set(action.fullYearCodes)
      // Already placed somewhere? Bail — caller should use move instead.
      for (const y of state.years) {
        for (const s of y.slots) {
          if (s.unitCodes.includes(action.code)) return state
        }
      }
      const nextYears = state.years.map((y, yi) => {
        if (yi !== action.yearIndex) return y
        return {
          ...y,
          slots: y.slots.map((s) => {
            if (s.kind !== "S1" && s.kind !== "S2") return s
            const fyN = countPrefix(s.unitCodes, fySet)
            const next = [...s.unitCodes]
            next.splice(fyN, 0, action.code)
            return { ...s, unitCodes: next }
          }),
        }
      })
      return { ...state, years: nextYears }
    }

    case "remove_full_year_unit": {
      return {
        ...state,
        years: state.years.map((y) => ({
          ...y,
          slots: y.slots.map((s) => {
            if (s.kind !== "S1" && s.kind !== "S2") return s
            if (!s.unitCodes.includes(action.code)) return s
            return {
              ...s,
              unitCodes: s.unitCodes.filter((c) => c !== action.code),
            }
          }),
        })),
      }
    }

    case "move_full_year_unit": {
      if (action.fromYearIndex === action.toYearIndex) return state
      const fySet = new Set(action.fullYearCodes)
      // Strip from source
      const stripped = state.years.map((y, yi) => {
        if (yi !== action.fromYearIndex) return y
        return {
          ...y,
          slots: y.slots.map((s) => {
            if (s.kind !== "S1" && s.kind !== "S2") return s
            if (!s.unitCodes.includes(action.code)) return s
            return {
              ...s,
              unitCodes: s.unitCodes.filter((c) => c !== action.code),
            }
          }),
        }
      })
      // Insert into target
      const inserted = stripped.map((y, yi) => {
        if (yi !== action.toYearIndex) return y
        return {
          ...y,
          slots: y.slots.map((s) => {
            if (s.kind !== "S1" && s.kind !== "S2") return s
            if (s.unitCodes.includes(action.code)) return s
            const fyN = countPrefix(s.unitCodes, fySet)
            const next = [...s.unitCodes]
            next.splice(fyN, 0, action.code)
            return { ...s, unitCodes: next }
          }),
        }
      })
      return { ...state, years: inserted }
    }

    case "bulk_load": {
      let next: PlannerState =
        action.mode === "replace"
          ? {
              ...state,
              years: state.years.map((y) => ({
                ...y,
                slots: y.slots.map((s) => ({ ...s, unitCodes: [] })),
              })),
            }
          : state
      const maxYi = action.placements.reduce(
        (m, p) => Math.max(m, p.yearIndex),
        -1
      )
      while (next.years.length <= maxYi) {
        next = {
          ...next,
          years: [...next.years, defaultYear(next.years.length + 1)],
        }
      }
      const grouped = new Map<string, string[]>()
      for (const p of action.placements) {
        const k = `${p.yearIndex}:${p.slotIndex}`
        const list = grouped.get(k)
        if (list) list.push(p.code)
        else grouped.set(k, [p.code])
      }
      return {
        ...next,
        years: next.years.map((y, yi) => ({
          ...y,
          slots: y.slots.map((s, si) => {
            const adds = grouped.get(`${yi}:${si}`)
            if (!adds || adds.length === 0) return s
            const seen = new Set(s.unitCodes)
            const merged = [...s.unitCodes]
            for (const c of adds) {
              if (!seen.has(c)) {
                merged.push(c)
                seen.add(c)
              }
            }
            if (merged.length === s.unitCodes.length) return s
            return { ...s, unitCodes: merged }
          }),
        })),
      }
    }

    case "add_year":
      return {
        ...state,
        years: [...state.years, defaultYear(state.years.length + 1)],
      }

    case "remove_year":
      if (state.years.length <= 1) return state
      return {
        ...state,
        years: state.years
          .filter((_, i) => i !== action.yearIndex)
          .map((y, i) => ({ ...y, label: `Year ${i + 1}` })),
      }

    case "add_optional_slot": {
      const year = state.years[action.yearIndex]
      if (!year) return state
      if (year.slots.some((s) => s.kind === action.kind)) return state
      const newSlot: PlannerSlot = { kind: action.kind, unitCodes: [] }
      return {
        ...state,
        years: state.years.map((y, i) =>
          i === action.yearIndex ? { ...y, slots: [...y.slots, newSlot] } : y
        ),
      }
    }

    case "remove_slot":
      return {
        ...state,
        years: state.years.map((y, i) =>
          i === action.yearIndex
            ? {
                ...y,
                slots: y.slots.filter((_, si) => si !== action.slotIndex),
              }
            : y
        ),
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

    case "reset":
      return defaultState(state.courseYear, null, action.yearCount ?? 3)

    case "hydrate":
      return action.state
  }
}

function countPrefix(
  unitCodes: readonly string[],
  fullYearCodes: ReadonlySet<string>
): number {
  let n = 0
  for (const c of unitCodes) {
    if (fullYearCodes.has(c)) n++
    else break
  }
  return n
}

function withSlot(
  state: PlannerState,
  yearIndex: number,
  slotIndex: number,
  fn: (slot: PlannerSlot) => PlannerSlot
): PlannerState {
  return {
    ...state,
    years: state.years.map((y, yi) =>
      yi !== yearIndex
        ? y
        : {
            ...y,
            slots: y.slots.map((s, si) => (si !== slotIndex ? s : fn(s))),
          }
    ),
  }
}
