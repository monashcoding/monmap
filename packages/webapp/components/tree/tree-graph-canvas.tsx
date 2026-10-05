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
import type { TreeEdge } from "@/lib/tree/types"

import type { TreeGraphProps } from "./tree-graph"
import { UnitNode, type UnitNodeData } from "./unit-node"

const NODE_TYPES = { unit: UnitNode }

export type TreeGraphCanvasProps = Omit<TreeGraphProps, "overlay" | "className">

/**
 * The React Flow canvas inside TreeGraph. It holds React Flow and
 * dagre, so TreeGraph loads it as its own chunk after the page.
 */
export function TreeGraphCanvas(props: TreeGraphCanvasProps) {
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
  fitAll = false,
  minimap = true,
  interactive = true,
  scrollZoom = interactive,
}: TreeGraphCanvasProps) {
  const lineage = useMemo(
    () => computeLineage(focused, edges),
    [focused, edges]
  )

  // The layout depends only on the codes, in order, and the edges, so
  // a click (focus) or a re-render with the same units reuses it.
  const codesKey = nodes.map((n) => n.code).join(",")
  const layout = useMemo(
    () => layoutTree({ nodes: codesKey ? codesKey.split(",") : [], edges }),
    [codesKey, edges]
  )

  const rfNodes = useMemo<Node<UnitNodeData>[]>(() => {
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
  }, [layout, nodes, focused, lineage, variantCounts])

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
                ? "var(--emphasis)"
                : "color-mix(in oklab, var(--color-foreground) 25%, transparent)",
              strokeWidth: onPath ? 2 : 1.25,
              strokeDasharray: e.type === "corequisite" ? "5 4" : undefined,
              opacity: dimmed ? 0.15 : 1,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: onPath
                ? "var(--emphasis)"
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

  // Bound the pannable area to (node bounding box) + 1 viewport of
  // headroom. Without this you can flick the canvas and the entire
  // graph disappears off into nowhere — disorienting on the empty
  // state (no nodes at all) and annoying on a populated graph if you
  // overshoot. We add ~800px of slack so users still feel like they
  // can roam, just not infinitely.
  const translateExtent = useMemo<[[number, number], [number, number]]>(() => {
    const PAD = 800
    if (layout.nodes.length === 0) {
      return [
        [-PAD, -PAD],
        [PAD, PAD],
      ]
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of layout.nodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + NODE_DIMS.width)
      maxY = Math.max(maxY, n.y + NODE_DIMS.height)
    }
    return [
      [minX - PAD, minY - PAD],
      [maxX + PAD, maxY + PAD],
    ]
  }, [layout])

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={interactive}
      proOptions={{ hideAttribution: true }}
      onNodeClick={interactive ? handleNodeClick : undefined}
      onPaneClick={interactive ? () => onFocus(null) : undefined}
      panOnDrag
      zoomOnScroll={scrollZoom}
      zoomOnPinch
      zoomOnDoubleClick={interactive}
      // False lets a two-finger scroll reach the page; ReactFlow still
      // takes a trackpad pinch (a ctrl+wheel event) as zoom.
      preventScrolling={scrollZoom}
      fitView
      fitViewOptions={
        fitAll
          ? { padding: 0.06, maxZoom: 1, minZoom: 0.05 }
          : { padding: 0.18, maxZoom: 1, minZoom: 0.4 }
      }
      minZoom={fitAll ? 0.05 : 0.25}
      maxZoom={1.5}
      translateExtent={translateExtent}
      defaultEdgeOptions={{ type: "smoothstep" }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        className="!bg-card"
      />
      {interactive ? (
        <Controls
          showInteractive={false}
          // Below md the 26px buttons grow to 40px for touch; React Flow
          // caps the icons at 12px, so the caps lift too.
          className="!rounded-control !border !bg-card !shadow-card [&_button]:!border-none [&_button]:!bg-transparent max-md:[&_button]:!size-10 max-md:[&_button_svg]:!size-4 max-md:[&_button_svg]:!max-h-4 max-md:[&_button_svg]:!max-w-4 [&_button:hover]:!bg-muted"
        />
      ) : null}
      {interactive && minimap ? (
        <MiniMap
          pannable
          zoomable
          maskColor="var(--color-muted)"
          nodeColor={(n) =>
            (n.data as unknown as UnitNodeData).isFocused
              ? "var(--emphasis)"
              : "var(--color-foreground)"
          }
          className="!hidden !rounded-control !border !bg-card/90 !shadow-card sm:!block"
        />
      ) : null}
    </ReactFlow>
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
