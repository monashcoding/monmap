"use client"

import "@xyflow/react/dist/style.css"

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react"
import { useMemo } from "react"

import { layoutTree, NODE_DIMS } from "@/lib/tree/layout"
import type { TreeEdge, TreeNode } from "@/lib/tree/types"

import { UnitNode, type UnitNodeData } from "./unit-node"

const NODE_TYPES = { unit: UnitNode }

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
export function TreeGraph(props: TreeGraphProps) {
  return (
    <ReactFlowProvider>
      <TreeGraphInner {...props} />
    </ReactFlowProvider>
  )
}

function TreeGraphInner({
  nodes,
  edges,
  focused,
  variantCounts,
  onFocus,
}: TreeGraphProps) {
  const lineage = useMemo(
    () => computeLineage(focused, edges),
    [focused, edges]
  )

  const rfNodes = useMemo<Node<UnitNodeData>[]>(() => {
    const layout = layoutTree({
      nodes: nodes.map((n) => n.code),
      edges,
      meta: new Map(
        nodes.map((n) => [n.code, { level: n.level, isSeed: n.isSeed }])
      ),
    })
    const byCode = new Map(nodes.map((n) => [n.code, n]))
    return layout.nodes.map((p) => {
      const t = byCode.get(p.code)!
      const data: UnitNodeData = {
        ...t,
        variantCount: variantCounts.get(p.code) ?? 1,
        isFocused: focused === p.code,
        isOnFocusedPath: lineage.has(p.code) && focused !== p.code,
        isDimmed: focused != null && !lineage.has(p.code),
      }
      return {
        id: p.code,
        type: "unit",
        position: { x: p.x, y: p.y },
        data,
        width: NODE_DIMS.width,
        height: NODE_DIMS.height,
        draggable: false,
      }
    })
  }, [nodes, edges, focused, lineage, variantCounts])

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges
        // Render prereq/coreq with prereq pointing *left to right* —
        // ReactFlow's source/target maps to handle positions, so we
        // flip: edge `from` (depends on) → `to` (prereq) becomes
        // `source: to, target: from`.
        .filter((e) => e.type !== "prohibition")
        .map((e, i) => {
          const onPath =
            focused != null && lineage.has(e.from) && lineage.has(e.to)
          const dimmed = focused != null && !onPath
          return {
            id: `${e.from}->${e.to}-${i}`,
            source: e.to,
            target: e.from,
            // Default (bezier) curves around intermediate nodes far more
            // gracefully than `smoothstep`, which forces 90° corners
            // through whatever's in the way.
            type: "default",
            animated: false,
            style: {
              stroke: onPath
                ? "var(--monash-purple)"
                : "color-mix(in oklab, var(--color-foreground) 25%, transparent)",
              strokeWidth: onPath ? 2 : 1.25,
              strokeDasharray: e.type === "corequisite" ? "5 4" : undefined,
              opacity: dimmed ? 0.15 : 1,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: onPath
                ? "var(--monash-purple)"
                : "color-mix(in oklab, var(--color-foreground) 45%, transparent)",
              width: 14,
              height: 14,
            },
          }
        }),
    [edges, focused, lineage]
  )

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    onFocus(node.id === focused ? null : node.id)
  }

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden rounded-2xl border bg-card shadow-card">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onFocus(null)}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1, minZoom: 0.4 }}
        minZoom={0.25}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="!bg-background"
        />
        <Controls
          showInteractive={false}
          className="!rounded-xl !border !bg-card !shadow-card [&_button]:!border-none [&_button]:!bg-transparent [&_button:hover]:!bg-muted"
        />
        <MiniMap
          pannable
          zoomable
          maskColor="var(--color-muted)"
          nodeColor={(n) =>
            (n.data as unknown as UnitNodeData).isFocused
              ? "var(--monash-purple)"
              : "var(--color-foreground)"
          }
          className="!hidden !rounded-xl !border !bg-card/90 !shadow-card sm:!block"
        />
      </ReactFlow>
    </div>
  )
}

/**
 * Codes on the directed path through `focused` — both ancestors
 * (prereqs of focused) and descendants (what focused unlocks).
 */
function computeLineage(
  focused: string | null,
  edges: readonly TreeEdge[]
): Set<string> {
  const out = new Set<string>()
  if (!focused) return out
  out.add(focused)
  const fwd = new Map<string, string[]>()
  const rev = new Map<string, string[]>()
  for (const e of edges) {
    if (e.type === "prohibition") continue
    fwd.set(e.from, [...(fwd.get(e.from) ?? []), e.to])
    rev.set(e.to, [...(rev.get(e.to) ?? []), e.from])
  }
  const walk = (start: string, adj: Map<string, string[]>) => {
    const stack = [start]
    while (stack.length) {
      const c = stack.pop()!
      for (const n of adj.get(c) ?? []) {
        if (out.has(n)) continue
        out.add(n)
        stack.push(n)
      }
    }
  }
  walk(focused, fwd)
  walk(focused, rev)
  return out
}
