import { test } from "node:test"
import assert from "node:assert/strict"

import { layoutTree } from "./layout.ts"
import type { TreeEdge } from "./types.ts"

test("empty input returns empty result", () => {
  const out = layoutTree({ nodes: [], edges: [] })
  assert.equal(out.nodes.length, 0)
  assert.equal(out.width, 0)
})

test("every node gets a position", () => {
  const nodes = ["FIT1045", "FIT1008", "MAT1830", "FIT2004", "FIT3155"]
  const edges: TreeEdge[] = [
    { from: "FIT1008", to: "FIT1045", type: "prerequisite" },
    { from: "FIT2004", to: "FIT1008", type: "prerequisite" },
    { from: "FIT2004", to: "MAT1830", type: "prerequisite" },
    { from: "FIT3155", to: "FIT2004", type: "prerequisite" },
  ]
  const out = layoutTree({ nodes, edges })
  assert.equal(out.nodes.length, nodes.length)
  for (const n of out.nodes) {
    assert.ok(Number.isFinite(n.x), `x finite for ${n.code}`)
    assert.ok(Number.isFinite(n.y), `y finite for ${n.code}`)
  }
})

test("prereqs are placed left of dependants", () => {
  const nodes = ["FIT3155", "FIT1045"]
  const edges: TreeEdge[] = [
    { from: "FIT3155", to: "FIT1045", type: "prerequisite" },
  ]
  const out = layoutTree({ nodes, edges })
  const pre = out.nodes.find((n) => n.code === "FIT1045")!
  const dep = out.nodes.find((n) => n.code === "FIT3155")!
  assert.ok(pre.x < dep.x, "FIT1045 should sit left of FIT3155")
})

test("prohibition edges don't pull nodes into the layout", () => {
  // Without the filter, mutual prohibitions would force same-rank
  // placement and bloat the graph. We strip them and let unrelated
  // siblings find their own spots.
  const nodes = ["FIT1045", "FIT1053"]
  const edges: TreeEdge[] = [
    { from: "FIT1045", to: "FIT1053", type: "prohibition" },
    { from: "FIT1053", to: "FIT1045", type: "prohibition" },
  ]
  const out = layoutTree({ nodes, edges })
  // Both placed somewhere; layout completed without crash.
  assert.equal(out.nodes.length, 2)
})

test("layout is deterministic", () => {
  const nodes = ["FIT3155", "FIT2004", "FIT1008", "FIT1045"]
  const edges: TreeEdge[] = [
    { from: "FIT3155", to: "FIT2004", type: "prerequisite" },
    { from: "FIT2004", to: "FIT1008", type: "prerequisite" },
    { from: "FIT1008", to: "FIT1045", type: "prerequisite" },
  ]
  const a = layoutTree({ nodes, edges })
  const b = layoutTree({ nodes, edges })
  assert.deepEqual(a.nodes, b.nodes)
})
