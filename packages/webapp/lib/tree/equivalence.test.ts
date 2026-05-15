import { test } from "node:test"
import assert from "node:assert/strict"

import { buildEquivalence, collapseEdges } from "./equivalence.ts"
import type { PlannerUnit } from "../planner/types.ts"
import type { TreeEdge } from "./types.ts"

function u(code: string, title: string): PlannerUnit {
  return {
    year: "2026",
    code,
    title,
    creditPoints: 6,
    level: null,
    synopsis: null,
    school: null,
  }
}

test("title-suffix pairs collapse", () => {
  const units = new Map<string, PlannerUnit | null>([
    ["FIT1045", u("FIT1045", "Introduction to programming")],
    ["FIT1053", u("FIT1053", "Introduction to programming (Advanced)")],
    ["FIT1008", u("FIT1008", "Fundamentals of algorithms")],
  ])
  const eq = buildEquivalence(["FIT1045", "FIT1053", "FIT1008"], units, [])
  assert.equal(eq.canonicalOf.get("FIT1045"), "FIT1045")
  assert.equal(eq.canonicalOf.get("FIT1053"), "FIT1045")
  assert.equal(eq.canonicalOf.get("FIT1008"), "FIT1008")
  assert.equal(eq.groups.size, 2)
})

test("identical prereq sets collapse", () => {
  const codes = ["ACX2100", "ACF2100", "ACC2100", "ACX1100"]
  const units = new Map<string, PlannerUnit | null>(
    codes.map((c) => [c, u(c, c)])
  )
  const edges: TreeEdge[] = [
    { from: "ACX2100", to: "ACX1100", type: "prerequisite" },
    { from: "ACX2100", to: "ACB1120", type: "prerequisite" },
    { from: "ACF2100", to: "ACX1100", type: "prerequisite" },
    { from: "ACF2100", to: "ACB1120", type: "prerequisite" },
    { from: "ACC2100", to: "ACX1100", type: "prerequisite" },
    { from: "ACC2100", to: "ACB1120", type: "prerequisite" },
  ]
  const eq = buildEquivalence(codes, units, edges)
  // ACC < ACF < ACX, so ACC2100 should be canonical.
  assert.equal(eq.canonicalOf.get("ACX2100"), "ACC2100")
  assert.equal(eq.canonicalOf.get("ACF2100"), "ACC2100")
  assert.equal(eq.canonicalOf.get("ACC2100"), "ACC2100")
  assert.equal(eq.canonicalOf.get("ACX1100"), "ACX1100")
})

test("mutual prohibitions collapse", () => {
  const codes = ["FIT1045", "FIT1053"]
  const units = new Map<string, PlannerUnit | null>([
    ["FIT1045", u("FIT1045", "Different title A")],
    ["FIT1053", u("FIT1053", "Different title B")],
  ])
  const edges: TreeEdge[] = [
    { from: "FIT1045", to: "FIT1053", type: "prohibition" },
    { from: "FIT1053", to: "FIT1045", type: "prohibition" },
  ]
  const eq = buildEquivalence(codes, units, edges)
  assert.equal(eq.canonicalOf.get("FIT1053"), "FIT1045")
  assert.equal(eq.groups.get("FIT1045")?.members.length, 2)
})

test("collapseEdges drops self-edges and dupes", () => {
  const canonicalOf = new Map([
    ["FIT1045", "FIT1045"],
    ["FIT1053", "FIT1045"],
    ["FIT1008", "FIT1008"],
  ])
  const edges: TreeEdge[] = [
    { from: "FIT1008", to: "FIT1045", type: "prerequisite" },
    { from: "FIT1008", to: "FIT1053", type: "prerequisite" }, // dup post-collapse
    { from: "FIT1045", to: "FIT1053", type: "prohibition" }, // self-edge post-collapse
  ]
  const out = collapseEdges(edges, canonicalOf)
  assert.equal(out.length, 1)
  assert.deepEqual(out[0], {
    from: "FIT1008",
    to: "FIT1045",
    type: "prerequisite",
  })
})
