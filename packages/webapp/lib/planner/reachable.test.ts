import { test } from "node:test"
import assert from "node:assert/strict"

import { effectiveRequired, reachableOptions } from "./reachable.ts"
import type { RequirementGroup } from "./types.ts"

/** B2001 Part A as baked: "6 of these 7". */
const partA: RequirementGroup = {
  grouping: "Part A. Core studies",
  required: 6,
  options: [
    "ACC1100",
    "ACC1001",
    "BTC1110",
    "ECC1000",
    "ETC1000",
    "MGC1010",
    "MKC1200",
  ],
}

/** Symmetrised edges, as the resolver ships them. */
const conflicts = {
  BTC1110: ["LAW2102"],
  LAW2102: ["BTC1110"],
  ACC1100: ["ACC1001"],
  ACC1001: ["ACC1100"],
}

test("reachable: an untouched plan sees every option", () => {
  assert.equal(reachableOptions(partA, new Set(), conflicts).length, 7)
  assert.equal(effectiveRequired(partA, new Set(), conflicts), 6)
})

test("reachable: a compulsory unit from the other degree rules an option out", () => {
  // L3005: the law half makes LAW2102 compulsory, so BTC1110 is gone.
  const plan = new Set(["LAW2102"])
  assert.ok(!reachableOptions(partA, plan, conflicts).includes("BTC1110"))
  assert.equal(effectiveRequired(partA, plan, conflicts), 6)
})

test("reachable: Laws/Commerce Part A can actually be completed", () => {
  // The student's real end state: LAW2102 from the law half, one of the
  // accounting pair, and the four remaining cores. Six was never
  // reachable; five is, and five is what the panel must ask for.
  const plan = new Set([
    "LAW2102",
    "ACC1100",
    "ECC1000",
    "ETC1000",
    "MGC1010",
    "MKC1200",
  ])
  const reachable = reachableOptions(partA, plan, conflicts)
  assert.deepEqual(reachable.sort(), [
    "ACC1100",
    "ECC1000",
    "ETC1000",
    "MGC1010",
    "MKC1200",
  ])
  assert.equal(effectiveRequired(partA, plan, conflicts), 5)
  const placed = partA.options.filter((c) => plan.has(c)).length
  assert.equal(placed, 5, "and all five are placed — 100%")
})

test("reachable: an option already placed stays reachable", () => {
  // Placing both halves of a pick-one pair is a validation error
  // elsewhere; it must not make the group unsatisfiable here.
  const plan = new Set(["ACC1100", "ACC1001"])
  const reachable = reachableOptions(partA, plan, conflicts)
  assert.ok(reachable.includes("ACC1100"))
  assert.ok(reachable.includes("ACC1001"))
})

test("reachable: no conflict data leaves the group untouched", () => {
  assert.equal(effectiveRequired(partA, new Set(["LAW2102"]), undefined), 6)
})
