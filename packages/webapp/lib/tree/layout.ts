/**
 * Graph layout for the unit tree, powered by dagre.
 *
 * Dagre does proper layered DAG placement with crossing minimisation
 * over the actual graph, not over Monash's level-digit convention.
 * That means rank = "longest chain to a sink" rather than "first
 * digit in the code" — so unrelated level-1 units don't get stuffed
 * into the same column when they share no dependencies.
 *
 * We keep the rank direction left-to-right (prereq on the left,
 * dependant on the right) and feed dagre the same dimensions used by
 * the renderer, so positions are pixel-accurate.
 *
 * The function is pure and deterministic given the same input.
 */

import dagre from "@dagrejs/dagre"

import type { TreeEdge } from "./types.ts"

export interface LayoutInput {
  /** Every code in the closure, after equivalence collapse. */
  nodes: readonly string[]
  /** Every edge whose endpoints are both in `nodes`. */
  edges: readonly TreeEdge[]
  /**
   * Per-node display metadata. Currently only used for stable
   * tiebreaking in dagre's `order` field.
   */
  meta: ReadonlyMap<string, { level: number; isSeed: boolean }>
}

export interface PositionedNode {
  code: string
  /** Canvas x of the node's left edge. */
  x: number
  /** Canvas y of the node's top edge. */
  y: number
  width: number
  height: number
}

export interface LayoutResult {
  nodes: PositionedNode[]
  /** Total canvas size — used for viewport sizing. */
  width: number
  height: number
}

const NODE_WIDTH = 196
const NODE_HEIGHT = 64
// Generous rank separation gives edges room to curve around intervening
// nodes; tight node separation keeps the canvas compact vertically.
const RANK_SEP = 140
const NODE_SEP = 24
const EDGE_SEP = 20
const PADDING = 32

export const NODE_DIMS = { width: NODE_WIDTH, height: NODE_HEIGHT } as const

/**
 * Layout `nodes` + `edges` with dagre. The output gives each node a
 * pixel-accurate (x, y) such that prereq edges flow left → right and
 * sibling chains don't cross unnecessarily.
 *
 * Prohibition edges are excluded from the layout: they're a *display*
 * concern (equivalent-unit hints) and shouldn't drag prohibited pairs
 * into the same rank.
 */
export function layoutTree(input: LayoutInput): LayoutResult {
  if (input.nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 }
  }

  const g = new dagre.graphlib.Graph({ directed: true, multigraph: false })
  g.setGraph({
    rankdir: "LR",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    edgesep: EDGE_SEP,
    marginx: PADDING,
    marginy: PADDING,
    align: "UL",
    ranker: "tight-tree",
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const code of input.nodes) {
    g.setNode(code, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  // Only structural edges drive layout. Edge direction in dagre flows
  // source → target; we want prereq (input.to) on the left of the
  // dependant (input.from), so set source = prereq, target = dependant.
  for (const e of input.edges) {
    if (e.type === "prohibition") continue
    if (!g.hasNode(e.from) || !g.hasNode(e.to)) continue
    g.setEdge(e.to, e.from)
  }

  dagre.layout(g)

  const nodes: PositionedNode[] = []
  let maxRight = 0
  let maxBottom = 0
  for (const code of input.nodes) {
    const n = g.node(code)
    if (!n) continue
    // Dagre returns the centre of the node; convert to top-left.
    const x = n.x - NODE_WIDTH / 2
    const y = n.y - NODE_HEIGHT / 2
    nodes.push({ code, x, y, width: NODE_WIDTH, height: NODE_HEIGHT })
    maxRight = Math.max(maxRight, x + NODE_WIDTH)
    maxBottom = Math.max(maxBottom, y + NODE_HEIGHT)
  }

  return {
    nodes,
    width: maxRight + PADDING,
    height: maxBottom + PADDING,
  }
}

export function parseLevel(code: string): number {
  // Monash codes: 3 letters then 4 digits. The first digit is the level.
  const m = /^[A-Za-z]{3}(\d)/.exec(code)
  return m ? Number(m[1]) : 0
}
