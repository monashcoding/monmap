"use client"

import { ExternalLinkIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { RatingInline } from "@/components/reviews/stars"
import { useRating } from "@/components/reviews/use-ratings"
import { TreeGraph, TreeGraphFrame } from "@/components/tree/tree-graph"
import { Button } from "@/components/ui/button"
import { fetchPlanGraph } from "@/lib/api/client"
import { entityHref } from "@/lib/handbook/links"
import { placedUnitCodes } from "@/lib/planner/progress"
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
  /** "thumbnail" is zoomed out, with only pinch-zoom and drag-to-pan. */
  variant?: "full" | "thumbnail"
  /**
   * False holds the map back: no fetch and no graph, only its empty
   * frame. The planner passes false where CSS hides the map.
   */
  enabled?: boolean
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
  enabled = true,
  className,
}: PlanMapProps) {
  const interactive = variant === "full"
  const [focused, setFocused] = useState<string | null>(null)

  const planned = useMemo(
    () => placedUnitCodes({ years: state.years }),
    [state.years]
  )

  const untaken = useMemo(
    () => [...new Set(requirementCodes)].filter((c) => !planned.has(c)),
    [requirementCodes, planned]
  )

  const codesKey = [...planned, ...untaken].sort().join(",")
  const untakenKey = untaken.join(",")
  // The map's units in plan order, kept while the set of units stays
  // the same: a move or reorder then reuses the layout, which depends
  // on the order (see layoutTree).
  const codes = useMemo(
    () => [...planned, ...untaken],
    // codesKey stands in for planned and untaken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codesKey]
  )

  const [data, setData] = useState<{
    edges: TreeEdge[]
    units: Record<string, PlannerUnit>
  } | null>(null)

  // Refetch when the set of units changes, not on every move; the
  // short delay batches a burst of edits into one request.
  useEffect(() => {
    if (!enabled || codes.length === 0) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchPlanGraph(codes, state.courseYear, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) setData(res)
        })
        .catch(() => {})
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
    // codesKey stands in for codes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, codesKey, state.courseYear])

  const nodes = useMemo<TreeNode[]>(() => {
    const untakenSet = new Set(untakenKey.split(","))
    return codes.map((code) => ({
      code,
      unit: data?.units[code] ?? knownUnits?.get(code) ?? null,
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
  }, [codes, untakenKey, data, knownUnits, grades])

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

  if (!enabled) return <TreeGraphFrame className={className} />

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
      overlay={
        interactive && focused ? (
          <FocusedUnitCard
            code={focused}
            title={nodes.find((n) => n.code === focused)?.unit?.title ?? null}
            year={state.courseYear}
            onClose={() => setFocused(null)}
          />
        ) : null
      }
      className={className}
    />
  )
}

/**
 * The clicked unit, over the map's top-right corner, with a link to
 * its page. The map itself only highlights the unit's chain.
 */
function FocusedUnitCard({
  code,
  title,
  year,
  onClose,
}: {
  code: string
  title: string | null
  year: string
  onClose: () => void
}) {
  const rating = useRating("unit", code)
  const href = entityHref("unit", code, year)
  return (
    <div className="absolute top-3 right-3 z-20 flex w-[min(300px,calc(100%-1.5rem))] flex-col rounded-panel border bg-card p-4 shadow-2xl ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={href}
            className="self-start text-base leading-tight font-bold tabular-nums underline-offset-2 hover:underline"
          >
            {code}
          </Link>
          {title ? (
            <Link
              href={href}
              className="text-sm leading-snug font-medium text-foreground/85 underline-offset-2 hover:underline"
            >
              {title}
            </Link>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close unit card"
          className="-mt-0.5 -mr-1 shrink-0"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="mt-2.5 flex h-4 items-center">
        {rating ? <RatingInline summary={rating} size="xs" /> : null}
      </div>
      <Link
        href={href}
        className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-control bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/80"
      >
        <ExternalLinkIcon className="size-3.5" aria-hidden />
        View Details
      </Link>
    </div>
  )
}
