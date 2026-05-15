/**
 * Domain types for the Unit Tree page.
 *
 * The Tree visualizes the prerequisite/corequisite/prohibition graph
 * between units. Edges come from the flat `requisite_refs` table —
 * which loses AND/OR semantics by design. For gate semantics we hand
 * the focused node's structured rule to the planner's existing
 * `RequisiteTreeView`. This keeps the graph readable and the rules
 * accurate.
 */

import type { PlannerUnit } from "../planner/types.ts"

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
  /** Level digit parsed from the code (1..9). 0 if not parseable. */
  level: number
  /** Faculty prefix — first 3 letters of the code. */
  prefix: string
  /** Whether this node was an anchor seed (highlighted differently). */
  isSeed: boolean
  /** Whether the unit has a non-trivial enrolment-rule gate. */
  hasEnrolmentGate: boolean
  /** Compact period badge: 'S1' | 'S2' | 'S1+S2' | 'Su' | 'FY' | null. */
  periodBadge: string | null
  /** Plan placement: 'completed' | 'placed' | null. */
  planStatus: "completed" | "placed" | null
}

/**
 * Visual partition for grouping nodes inside the canvas. The course-
 * mode view uses partitions to separate Part A spine vs the chosen
 * major's core/elective. Unit mode uses a single "All" partition.
 */
export interface TreePartition {
  id: string
  /** Human-readable, e.g. "Part A — Specified studies". */
  label: string
  /** Codes belonging to this partition. */
  codes: string[]
}
