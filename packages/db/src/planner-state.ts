/**
 * Persisted shape of a user's planner state.
 *
 * Lives in the db package (not the webapp) because Drizzle's
 * `jsonb().$type<PlannerState>()` needs a real reference to the type
 * so the generated table types know what `state` is. Webapp re-exports
 * these from `lib/planner/types.ts` alongside its runtime-only types
 * (PlannerCourse, PlannerUnit, etc.).
 *
 * Shape decisions:
 *   - PRIMARY_SLOT_KINDS = S1, S2 — every year always has these. Other
 *     kinds (Summer A/B, Winter, Full Year) are optional add-on slots.
 *   - Slot.capacity is per-slot so a 3-unit semester or a 5-unit
 *     intensive doesn't leak across other slots.
 */

export type PeriodKind =
  | "S1"
  | "S2"
  | "SUMMER_A"
  | "SUMMER_B"
  | "WINTER"
  | "FULL_YEAR"
  | "OTHER"

export interface PlannerSlot {
  kind: PeriodKind
  unitCodes: string[]
  /**
   * Target count of units in this slot. Defaults to 4 (24cp full-time
   * load) when undefined. Bounded to [unitCodes.length, 8] in the UI.
   */
  capacity?: number
  /** User-supplied display label; falls back to the computed period+year label when absent. */
  label?: string
  /** When true, units in this slot cannot be moved in or out via drag-and-drop. */
  locked?: boolean
}

export interface PlannerYear {
  /** Display label like "Year 1" — not the handbook year. */
  label: string
  slots: PlannerSlot[]
}

export interface PlannerState {
  courseYear: string
  courseCode: string | null
  /**
   * Picked AoS codes, one per `kind`. The shape matches what a BIT
   * student actually picks: one major (+ optionally an elective major),
   * one minor, a specialisation, etc. We store by role so requirement-
   * progress can look up "the picked major" quickly.
   */
  selectedAos: {
    major?: string
    extendedMajor?: string
    minor?: string
    specialisation?: string
    /** Second specialisation slot — used by double-degree courses where
     * each component carries its own picker. */
    specialisation2?: string
    elective?: string
  }
  years: PlannerYear[]
}
