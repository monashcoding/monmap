import {
  DEFAULT_SLOT_CAPACITY,
  MAX_SLOT_CAPACITY,
  slotCapacity,
  type PeriodKind,
  type PlannerSlot,
  type PlannerState,
  type PlannerYear,
} from "./types.ts";
import { PRIMARY_SLOT_KINDS } from "./teaching-period.ts";

/**
 * Pure reducer + factory functions for PlannerState. Keeping these
 * pure lets the UI derive state transitions by applying actions and
 * lets tests exercise planner mutations without rendering anything.
 */

export function defaultState(
  courseYear: string,
  courseCode: string | null,
  yearCount = 3,
): PlannerState {
  return {
    courseYear,
    courseCode,
    selectedAos: {},
    years: Array.from({ length: yearCount }, (_, i) => defaultYear(i + 1)),
  };
}

export function defaultYear(nth: number): PlannerYear {
  return {
    label: `Year ${nth}`,
    slots: PRIMARY_SLOT_KINDS.map((kind) => ({
      kind,
      unitCodes: [],
      capacity: DEFAULT_SLOT_CAPACITY,
    })),
  };
}

export type PlannerAction =
  | { type: "set_course"; code: string | null }
  | { type: "set_aos"; role: keyof PlannerState["selectedAos"]; code: string | null }
  | { type: "add_unit"; yearIndex: number; slotIndex: number; code: string }
  | { type: "remove_unit"; yearIndex: number; slotIndex: number; code: string }
  | { type: "move_unit"; fromYearIndex: number; fromSlotIndex: number; toYearIndex: number; toSlotIndex: number; code: string }
  | { type: "add_year" }
  | { type: "remove_year"; yearIndex: number }
  | { type: "add_optional_slot"; yearIndex: number; kind: PeriodKind }
  | { type: "remove_slot"; yearIndex: number; slotIndex: number }
  | { type: "set_slot_capacity"; yearIndex: number; slotIndex: number; capacity: number }
  | { type: "reset"; yearCount?: number }
  | { type: "hydrate"; state: PlannerState };

export function plannerReducer(
  state: PlannerState,
  action: PlannerAction,
): PlannerState {
  switch (action.type) {
    case "set_course":
      if (state.courseCode === action.code) return state;
      return {
        ...state,
        courseCode: action.code,
        // Clear AoS selections when course changes — the prior picks
        // are almost certainly invalid for the new course.
        selectedAos: {},
      };

    case "set_aos": {
      const next = { ...state.selectedAos };
      if (!action.code) delete next[action.role];
      else next[action.role] = action.code;
      return { ...state, selectedAos: next };
    }

    case "add_unit":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => {
        if (slot.unitCodes.includes(action.code)) return slot;
        return { ...slot, unitCodes: [...slot.unitCodes, action.code] };
      });

    case "remove_unit":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => ({
        ...slot,
        unitCodes: slot.unitCodes.filter((c) => c !== action.code),
      }));

    case "move_unit": {
      const removed = withSlot(
        state,
        action.fromYearIndex,
        action.fromSlotIndex,
        (slot) => ({
          ...slot,
          unitCodes: slot.unitCodes.filter((c) => c !== action.code),
        }),
      );
      return withSlot(removed, action.toYearIndex, action.toSlotIndex, (slot) => {
        if (slot.unitCodes.includes(action.code)) return slot;
        return { ...slot, unitCodes: [...slot.unitCodes, action.code] };
      });
    }

    case "add_year":
      return {
        ...state,
        years: [...state.years, defaultYear(state.years.length + 1)],
      };

    case "remove_year":
      if (state.years.length <= 1) return state;
      return {
        ...state,
        years: state.years
          .filter((_, i) => i !== action.yearIndex)
          .map((y, i) => ({ ...y, label: `Year ${i + 1}` })),
      };

    case "add_optional_slot": {
      const year = state.years[action.yearIndex];
      if (!year) return state;
      if (year.slots.some((s) => s.kind === action.kind)) return state;
      const newSlot: PlannerSlot = { kind: action.kind, unitCodes: [] };
      return {
        ...state,
        years: state.years.map((y, i) =>
          i === action.yearIndex ? { ...y, slots: [...y.slots, newSlot] } : y,
        ),
      };
    }

    case "remove_slot":
      return {
        ...state,
        years: state.years.map((y, i) =>
          i === action.yearIndex
            ? { ...y, slots: y.slots.filter((_, si) => si !== action.slotIndex) }
            : y,
        ),
      };

    case "set_slot_capacity":
      return withSlot(state, action.yearIndex, action.slotIndex, (slot) => {
        // Keep capacity within [already-placed units, MAX]; a student
        // can't shrink below the units they've already placed.
        const floor = Math.max(1, slot.unitCodes.length);
        const next = Math.min(MAX_SLOT_CAPACITY, Math.max(floor, action.capacity));
        if (slotCapacity(slot) === next) return slot;
        return { ...slot, capacity: next };
      });

    case "reset":
      return defaultState(state.courseYear, null, action.yearCount ?? 3);

    case "hydrate":
      return action.state;
  }
}

function withSlot(
  state: PlannerState,
  yearIndex: number,
  slotIndex: number,
  fn: (slot: PlannerSlot) => PlannerSlot,
): PlannerState {
  return {
    ...state,
    years: state.years.map((y, yi) =>
      yi !== yearIndex
        ? y
        : {
            ...y,
            slots: y.slots.map((s, si) => (si !== slotIndex ? s : fn(s))),
          },
    ),
  };
}
