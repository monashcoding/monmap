/**
 * Server ↔ client payload types for the Tree page.
 *
 * Kept in its own module so both the server action and the client
 * orchestrator can import it without dragging in component code.
 */

import type {
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
} from "../planner/types.ts"
import type { TreeDirection, TreeGraphRaw, TreeMode } from "./types.ts"

export interface TreeControlsValue {
  mode: TreeMode
  courseCode: string | null
  aosCode: string | null
  unitCode: string | null
  direction: TreeDirection
  depth: number
  year: string
  useMyPlan: boolean
}

export interface TreeGraphPayload {
  graph: TreeGraphRaw
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
  enrolmentRules: Record<
    string,
    Array<{ ruleType: string | null; description: string | null }>
  >
}
