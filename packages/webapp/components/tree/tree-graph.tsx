"use client"

import dynamic from "next/dynamic"

import type { TreeEdge, TreeNode } from "@/lib/tree/types"
import { cn } from "@/lib/utils"

// React Flow and dagre load as their own chunk, after the page, so
// pages with a map don't wait for them; the server renders the frame.
const TreeGraphCanvas = dynamic(
  () => import("./tree-graph-canvas").then((m) => m.TreeGraphCanvas),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-muted/40" />,
  }
)

export interface TreeGraphProps {
  /** Hydrated nodes (after equivalence collapse, plan-status, badges). */
  nodes: TreeNode[]
  /** Edges, in canonical form (between TreeNode codes). */
  edges: TreeEdge[]
  /** The currently focused node code (or null). Drives highlight + dim. */
  focused: string | null
  /** Variant-count map: canonical code -> total members in its equivalence group. */
  variantCounts: ReadonlyMap<string, number>
  /** Click → set focus. Click empty canvas → null. */
  onFocus: (code: string | null) => void
  /**
   * The plan map's options. `fitAll` zooms out as far as needed to show
   * every node on load; `minimap` hides the corner overview when false;
   * `interactive` false makes a thumbnail: no clicks or controls, and
   * only drag-to-pan and pinch-to-zoom, so scrolling over it still
   * scrolls the page.
   */
  fitAll?: boolean
  /**
   * Open on the seed units (the page's own unit or units) instead of the
   * whole graph. A single seed brings its direct neighbours with it.
   */
  fitSeeds?: boolean
  minimap?: boolean
  interactive?: boolean
  /**
   * Whether the scroll wheel zooms. Defaults to `interactive`. A graph
   * inside a long page turns it off so the wheel scrolls the page;
   * pinch, drag and the zoom buttons still work.
   */
  scrollZoom?: boolean
  /** Drawn over the canvas, such as the plan map's unit card. */
  overlay?: React.ReactNode
  className?: string
}

/**
 * ReactFlow canvas for the unit tree.
 *
 * Positions come from our deterministic `layoutTree` (column-per-level,
 * median-barycentre row order). ReactFlow gives us pan / zoom /
 * fit-to-view / minimap for free, plus accessible keyboard focus.
 * Edges are bezier; arrows always point from prerequisite → dependant
 * so the chain reads left-to-right by level.
 */
export function TreeGraph({ overlay, className, ...canvas }: TreeGraphProps) {
  return (
    <TreeGraphFrame className={className}>
      <TreeGraphCanvas {...canvas} />
      {overlay}
    </TreeGraphFrame>
  )
}

/**
 * The box a TreeGraph draws in. Callers that hold the graph back (the
 * plan map below lg) render it empty so the layout keeps its size.
 */
export function TreeGraphFrame({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative h-full min-h-[480px] w-full overflow-hidden rounded-panel border bg-card shadow-card",
        className
      )}
    >
      {children}
    </div>
  )
}
