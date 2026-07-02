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
   * Picked AoS codes keyed by selection slot.
   *
   * Slot keys come in two generations, and both stay readable forever
   * so saved plans never migrate:
   *
   *   - Fixed roles: "major", "extendedMajor", "minor",
   *     "specialisation", "specialisation2", "elective". Written for
   *     courses whose picker has no component scoping, and consulted
   *     as a fallback everywhere (a value counts for a scoped slot
   *     when its code is one of that slot's options).
   *   - Component-scoped slots: "<kind>@<scope>", e.g. "major@S2000"
   *     or "specialisation@C2001:part-d-applied-studies", minted by
   *     the webapp's aos-slots module. Double degrees need a pick per
   *     component (Science major AND CS specialisation), and one
   *     fixed role per kind cannot express that.
   */
  selectedAos: Record<string, string | undefined>
  years: PlannerYear[]
}
