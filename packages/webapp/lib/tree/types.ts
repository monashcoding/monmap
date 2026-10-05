/**
 * Domain types for the requisite graph on the handbook pages and the
 * planner's plan map.
 *
 * The graph shows the prerequisite/corequisite/prohibition graph
 * between units. Edges come from the flat `requisite_refs` table —
 * which loses AND/OR semantics by design. For gate semantics we hand
 * the focused node's structured rule to the planner's existing
 * `RequisiteTreeView`. This keeps the graph readable and the rules
 * accurate.
 */

import type {
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
} from "../planner/types.ts"

export type TreeEdgeType = "prerequisite" | "corequisite" | "prohibition"

export type TreeDirection = "upstream" | "downstream" | "both"

export type TreeMode = "course" | "unit"

/** A raw edge as returned by the DB layer. */
export interface TreeEdge {
  /** Code that has the requirement. */
  from: string
  /** Code that satisfies / is referenced by the requirement. */
  to: string
  type: TreeEdgeType
}

/** Untyped subgraph straight off the DB, before equivalence-collapse or layout. */
export interface TreeGraphRaw {
  /** Codes the closure was anchored on (rendered as roots). */
  seeds: string[]
  /** Every code in the closure, including seeds. */
  nodes: string[]
  edges: TreeEdge[]
}

/** Hydrated node — DB graph + unit metadata + computed flags. */
export interface TreeNode {
  code: string
  /** May be null if the code is decommissioned in this year. */
  unit: PlannerUnit | null
  /** Faculty prefix — first 3 letters of the code. */
  prefix: string
  /** Whether this node was an anchor seed (highlighted differently). */
  isSeed: boolean
  /** Whether the unit has a non-trivial enrolment-rule gate. */
  hasEnrolmentGate: boolean
  /**
   * Compact period badge: 'FY', 'S1-S2', 'S1', 'S2', or the
   * PERIOD_KIND_SHORT of another kind ('SumA', 'Win', ...). Null when
   * the unit has no offerings.
   */
  periodBadge: string | null
  /**
   * Plan placement: 'completed' | 'placed' | null. 'untaken' marks a
   * unit the course lists that the plan doesn't include (plan map).
   */
  planStatus: "completed" | "placed" | "untaken" | null
}

/**
 * What the unit detail panel shows for the focused node. The synopsis
 * and enrolment-rule prose are not here: the panel loads them for the
 * node's codes when it opens (see useUnitText).
 */
export interface FocusedUnitDetail {
  node: TreeNode
  /** Codes equivalent to this one (excluding the canonical itself). */
  variants: string[]
  /** Offerings for the focused unit. */
  offerings: PlannerOffering[]
  /** Structured prereq/coreq/prohibition rules. */
  requisites: RequisiteBlock[]
  /** Codes the student already has in their plan (for ✓ marks). */
  completed: ReadonlySet<string>
}
