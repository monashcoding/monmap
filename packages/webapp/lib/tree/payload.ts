/**
 * Server ↔ client payload types for the Tree page.
 *
 * Kept in its own module so both the server action and the client
 * orchestrator can import it without dragging in component code.
 */

import type {
  EnrolmentRule,
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
} from "../planner/types.ts"
import type { TreeDirection, TreeGraphRaw, TreeMode } from "./types.ts"

/**
 * Tree controls value. `depth` used to be user-controllable but was
 * removed — it added a confusing knob that students rarely understood
 * and that bloated the URL space. Server-side closure expansion is
 * fixed at `FIXED_TREE_DEPTH` (see below).
 */
export interface TreeControlsValue {
  mode: TreeMode
  courseCode: string | null
  aosCode: string | null
  unitCode: string | null
  direction: TreeDirection
  year: string
}

/**
 * Default closure depth used everywhere a tree gets expanded. Deep
 * enough to surface a 3-level prereq chain (foundation → intermediate
 * → advanced unit), shallow enough that the layout stays readable.
 */
export const FIXED_TREE_DEPTH = 4

export interface TreeGraphPayload {
  graph: TreeGraphRaw
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
  /**
   * Codes with an enrolment rule, for the lock on their node. The rule
   * text loads with the detail panel, so the payload stays small.
   */
  gated: string[]
}

/** Codes with at least one enrolment rule that has text. */
export function gatedCodes(
  rules: ReadonlyMap<string, readonly EnrolmentRule[]>
): string[] {
  return [...rules]
    .filter(([, list]) => list.some((r) => r.description?.trim()))
    .map(([code]) => code)
}
