import { test } from "node:test"
import assert from "node:assert/strict"

import {
  applyFiltersAndSort,
  emptyFilters,
  type FiltersValue,
} from "./search-filters.ts"
import { offering, unit } from "./test-fixtures.ts"
import type { PlannerOffering } from "./types.ts"

const units = [
  unit("FIT3000", { level: "Level 3", creditPoints: 6 }),
  unit("FIT1000", { level: "Level 1", creditPoints: 12 }),
  unit("FIT2000", { level: "Level 2", creditPoints: 6 }),
  unit("FIT9000", { level: null, creditPoints: 6 }),
]
const offerings = new Map<string, PlannerOffering[]>([
  ["FIT1000", [offering("FIT1000", "S1")]],
  ["FIT2000", [offering("FIT2000", "S2")]],
  ["FIT3000", [offering("FIT3000", "S2")]],
])
const codes = (
  sortBy: Parameters<typeof applyFiltersAndSort>[2],
  f = emptyFilters()
) => applyFiltersAndSort(units, f, sortBy, offerings).map((u) => u.code)
const withFilter = (patch: Partial<FiltersValue>) => ({
  ...emptyFilters(),
  ...patch,
})

test("relevance keeps the server's order", () => {
  assert.deepEqual(codes("relevance"), [
    "FIT3000",
    "FIT1000",
    "FIT2000",
    "FIT9000",
  ])
})

test("level sorts put a missing level last in both directions", () => {
  assert.deepEqual(codes("level-asc"), [
    "FIT1000",
    "FIT2000",
    "FIT3000",
    "FIT9000",
  ])
  assert.deepEqual(codes("level-desc"), [
    "FIT3000",
    "FIT2000",
    "FIT1000",
    "FIT9000",
  ])
})

test("credit and code sorts", () => {
  assert.deepEqual(codes("credit").at(-1), "FIT1000")
  assert.deepEqual(codes("code"), ["FIT1000", "FIT2000", "FIT3000", "FIT9000"])
})

test("the level filter drops units with no level", () => {
  assert.deepEqual(codes("relevance", withFilter({ level: new Set([1, 3]) })), [
    "FIT3000",
    "FIT1000",
  ])
})

test("the period filter keeps units whose offerings haven't loaded", () => {
  assert.deepEqual(
    codes("relevance", withFilter({ period: new Set(["S2"]) })),
    ["FIT3000", "FIT2000", "FIT9000"]
  )
})
