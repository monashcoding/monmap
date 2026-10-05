"use client"

import { useEffect, useMemo, useState } from "react"

import { fetchPlanGraphAction } from "@/app/actions"
import { TreeGraph } from "@/components/tree/tree-graph"
import type { PlannerState, PlannerUnit } from "@/lib/planner/types"
import type { TreeEdge, TreeNode } from "@/lib/tree/types"

export interface PlanMapProps {
  state: PlannerState
  /** Units the course lists; those missing from the plan show dashed. */
  requirementCodes?: readonly string[]
  /** Unit data the caller already has, so titles show before the fetch. */
  knownUnits?: ReadonlyMap<string, PlannerUnit>
  /** Marks: a unit with one shows as completed. */
  grades?: ReadonlyMap<string, number>
  /** "thumbnail" is a static, zoomed-out picture with no interaction. */
  variant?: "full" | "thumbnail"
  className?: string
}

/**
 * A read-only map of a plan, drawn with the Search page's graph and
 * layout: the plan's units with arrows from each prerequisite to the
 * unit that needs it, plus the units the course lists that the plan
 * leaves out, drawn dashed. Only those units are fetched; nothing is
 * expanded beyond them, and nothing on the map edits the plan.
 */
export function PlanMap({
  state,
  requirementCodes = [],
  knownUnits,
  grades,
  variant = "full",
  className,
}: PlanMapProps) {
  const interactive = variant === "full"
  const [focused, setFocused] = useState<string | null>(null)

  const planned = useMemo(() => {
    const out = new Set<string>()
    for (const y of state.years)
      for (const s of y.slots) for (const c of s.unitCodes) out.add(c)
    return out
  }, [state.years])

  const untaken = useMemo(
    () => [...new Set(requirementCodes)].filter((c) => !planned.has(c)),
    [requirementCodes, planned]
  )

  const codes = useMemo(() => [...planned, ...untaken], [planned, untaken])
  const codesKey = useMemo(() => [...codes].sort().join(","), [codes])

  const [data, setData] = useState<{
    edges: TreeEdge[]
    units: Record<string, PlannerUnit>
  } | null>(null)

  // Refetch when the set of units changes, not on every move; the
  // short delay batches a burst of edits into one request.
  useEffect(() => {
    if (codes.length === 0) return
    let cancelled = false
    const timer = setTimeout(() => {
      void fetchPlanGraphAction(codes, state.courseYear).then((res) => {
        if (!cancelled) setData(res)
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // codesKey stands in for codes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codesKey, state.courseYear])

  const nodes = useMemo<TreeNode[]>(() => {
    const untakenSet = new Set(untaken)
    return codes.map((code) => ({
      code,
      unit: data?.units[code] ?? knownUnits?.get(code) ?? null,
      level: Number(code.match(/\d/)?.[0] ?? 0),
      prefix: code.slice(0, 3).toUpperCase(),
      isSeed: false,
      hasEnrolmentGate: false,
      periodBadge: null,
      planStatus: untakenSet.has(code)
        ? "untaken"
        : grades?.get(code) != null
          ? "completed"
          : null,
    }))
  }, [codes, untaken, data, knownUnits, grades])

  // Edges from an earlier fetch may name units that have since left
  // the plan; keep only those between nodes on the map.
  const edges = useMemo(() => {
    const present = new Set(codes)
    return (data?.edges ?? []).filter(
      (e) => present.has(e.from) && present.has(e.to)
    )
  }, [data, codes])

  const variantCounts = useMemo(() => new Map<string, number>(), [])

  if (codes.length === 0) {
    return interactive ? (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        Add units to your plan to see how they connect.
      </div>
    ) : null
  }

  return (
    <TreeGraph
      // Remount when the edges arrive or the units change, so the map
      // fits its final layout rather than the edge-less first pass.
      key={`${codesKey}:${data ? data.edges.length : "loading"}`}
      nodes={nodes}
      edges={edges}
      focused={interactive ? focused : null}
      variantCounts={variantCounts}
      onFocus={setFocused}
      fitAll
      minimap={false}
      interactive={interactive}
      className={className}
    />
  )
}
