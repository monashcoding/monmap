import { test } from "node:test"
import assert from "node:assert/strict"

import { offering, unit } from "./test-fixtures.ts"
import {
  keepUnitYears,
  mergeUnitMaps,
  unitBundleFor,
  unitMapsFrom,
} from "./unit-cache.ts"

const base = unitMapsFrom({
  units: { A: unit("A") },
  offerings: { A: [offering("A", "S1")] },
  requisites: { A: [] },
})

test("mergeUnitMaps writes the bundle over the maps without touching them", () => {
  const next = mergeUnitMaps(base, {
    units: { A: unit("A", { title: "New" }), B: unit("B") },
    offerings: { B: [offering("B", "S2")] },
    requisites: {},
  })
  assert.equal(next.units.get("A")?.title, "New")
  assert.equal(next.offerings.get("B")?.[0]?.periodKind, "S2")
  assert.equal(base.units.has("B"), false, "input unchanged")
  assert.notEqual(next.units, base.units)
})

test("mergeUnitMaps fills empty lists only for codes with no row", () => {
  const next = mergeUnitMaps(
    base,
    { units: {}, offerings: {}, requisites: {} },
    ["A", "C"]
  )
  assert.equal(next.offerings.get("A")?.length, 1, "kept")
  assert.deepEqual(next.offerings.get("C"), [])
  assert.deepEqual(next.requisites.get("C"), [])
  assert.equal(next.units.has("C"), false)
})

test("unitBundleFor takes one code and skips what is missing", () => {
  assert.deepEqual(Object.keys(unitBundleFor(base, "A").units), ["A"])
  assert.deepEqual(unitBundleFor(base, "Z"), {
    units: {},
    offerings: {},
    requisites: {},
  })
})

test("keepUnitYears keeps units good for the years, fallbacks included", () => {
  const maps = unitMapsFrom({
    units: {
      A: unit("A", { year: "2026" }),
      B: unit("B", { year: "2025" }),
      // 2027 has no ENG1005 page yet, so 2026's stands in for it.
      F: unit("F", { year: "2026", fallbackFor: "2027" }),
    },
    offerings: { A: [], B: [], F: [], EMPTY: [] },
    requisites: { A: [], B: [], F: [], EMPTY: [] },
  })
  const kept = keepUnitYears(maps, new Set(["2027"]))
  assert.deepEqual([...kept.units.keys()], ["F"])
  assert.deepEqual([...kept.offerings.keys()], ["F"])
  assert.deepEqual([...kept.requisites.keys()], ["F"])
  const both = keepUnitYears(maps, new Set(["2026", "2027"]))
  assert.deepEqual([...both.units.keys()].sort(), ["A", "F"])
})
