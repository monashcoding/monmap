"use client"

import { useMemo } from "react"

import { PERIOD_KIND_SHORT } from "@/lib/planner/teaching-period"
import type {
  PeriodKind,
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"
import { buildEquivalence, collapseEdges } from "@/lib/tree/equivalence"
import { parseLevel } from "@/lib/tree/layout"
import type { TreeGraphPayload } from "@/lib/tree/payload"
import type { TreeEdge, TreeNode } from "@/lib/tree/types"

import type { FocusedUnitDetail } from "./tree-side-panel"

const NO_CODES: ReadonlySet<string> = new Set()

/**
 * Turn a graph payload into what TreeGraph and TreeSidePanel draw:
 * equivalent units merged into one node, edges between the merged
 * nodes, and the side panel's detail for the focused node.
 */
export function useTreeModel(
  payload: TreeGraphPayload,
  focused: string | null,
  inPlan: ReadonlySet<string> = NO_CODES
) {
  const { graph, units, offerings, requisites, enrolmentRules } = payload

  const eq = useMemo(() => {
    const u = new Map<string, PlannerUnit | null>(
      graph.nodes.map((c) => [c, units[c] ?? null])
    )
    return buildEquivalence(graph.nodes, u, graph.edges)
  }, [graph, units])

  const edges = useMemo<TreeEdge[]>(
    () => collapseEdges(graph.edges, eq.canonicalOf),
    [graph.edges, eq]
  )

  const nodes = useMemo<TreeNode[]>(() => {
    const seeds = new Set(graph.seeds.map((s) => eq.canonicalOf.get(s) ?? s))
    return [...eq.groups.keys()].map((code) => ({
      code,
      unit: units[code] ?? null,
      level: parseLevel(code),
      prefix: code.slice(0, 3).toUpperCase(),
      isSeed: seeds.has(code),
      hasEnrolmentGate: (enrolmentRules[code] ?? []).some(
        (r) => r.description && r.description.trim().length > 0
      ),
      periodBadge: periodBadge(offerings[code] ?? []),
      planStatus: inPlan.has(code) ? "placed" : null,
    }))
  }, [eq, graph.seeds, units, offerings, enrolmentRules, inPlan])

  const variantCounts = useMemo(
    () =>
      new Map<string, number>(
        [...eq.groups.entries()].map(([k, g]) => [k, g.members.length])
      ),
    [eq]
  )

  const detail = useMemo<FocusedUnitDetail | null>(() => {
    if (!focused) return null
    const node = nodes.find((n) => n.code === focused)
    if (!node) return null
    const members = eq.groups.get(focused)?.members ?? [focused]
    // Equivalent units are interchangeable, so the panel shows the
    // union of their offerings, rules and enrolment rules.
    const reqs: RequisiteBlock[] = []
    const offs: PlannerOffering[] = []
    const rules: FocusedUnitDetail["enrolmentRules"] = []
    for (const m of members) {
      reqs.push(...(requisites[m] ?? []))
      offs.push(...(offerings[m] ?? []))
      rules.push(...(enrolmentRules[m] ?? []))
    }
    return {
      node,
      variants: members.filter((m) => m !== focused),
      offerings: offs,
      requisites: reqs,
      enrolmentRules: rules,
      completed: inPlan,
    }
  }, [focused, nodes, eq, requisites, offerings, enrolmentRules, inPlan])

  return { nodes, edges, variantCounts, detail }
}

function periodBadge(offerings: PlannerOffering[]): string | null {
  if (offerings.length === 0) return null
  const kinds = new Set<PeriodKind>(offerings.map((o) => o.periodKind))
  if (kinds.has("FULL_YEAR")) return "FY"
  const s1 = kinds.has("S1")
  const s2 = kinds.has("S2")
  if (s1 && s2) return "S1-S2"
  if (s1) return "S1"
  if (s2) return "S2"
  for (const k of kinds) if (k !== "OTHER") return PERIOD_KIND_SHORT[k]
  return PERIOD_KIND_SHORT.OTHER
}
