import { test } from "node:test"
import assert from "node:assert/strict"

import { codesToHydrate, emptyKey, isFreshFor } from "./hydration.ts"
import type { PlannerState, PlannerUnit } from "./types.ts"

const plan = (courseYear: string, ...years: string[][]): PlannerState => ({
  courseYear,
  courseCode: "E3001",
  selectedAos: {},
  years: years.map((codes, i) => ({
    label: `Year ${i + 1}`,
    slots: [{ kind: "S1", unitCodes: codes }],
  })),
})

const unit = (
  code: string,
  year: string,
  fallbackFor?: string
): Pick<PlannerUnit, "year" | "fallbackFor"> & { code: string } => ({
  code,
  year,
  ...(fallbackFor ? { fallbackFor } : {}),
})

function run(
  state: PlannerState,
  cached: Array<ReturnType<typeof unit>>,
  empty: string[] = []
) {
  const units = new Map(cached.map((u) => [u.code, u]))
  const loaded = new Map(cached.map((u) => [u.code, []]))
  return Object.fromEntries(
    codesToHydrate({
      state,
      availableYears: ["2026", "2027"],
      units,
      offerings: loaded,
      requisites: loaded,
      empty: new Set(empty),
    })
  )
}

test("hydration: a unit cached from another year is refetched for the slot's year", () => {
  assert.deepEqual(run(plan("2027", ["FIT1045"]), [unit("FIT1045", "2026")]), {
    "2027": ["FIT1045"],
  })
})

test("hydration: a fallback unit for the slot's year counts as fresh", () => {
  // The server answers a 2027 request for ENG1005 with the 2026 unit.
  // Refetching would return the same unit and loop.
  assert.deepEqual(
    run(plan("2027", ["ENG1005"]), [unit("ENG1005", "2026", "2027")]),
    {}
  )
})

test("hydration: a fallback is fresh only for the year it was fetched for", () => {
  // A 2025 unit returned for a 2026 request, now sitting in a 2027 slot.
  assert.deepEqual(
    run(plan("2026", [], ["ENG1005"]), [unit("ENG1005", "2025", "2026")]),
    { "2027": ["ENG1005"] }
  )
})

test("hydration: a code that came back empty is not requested again for that year", () => {
  const state = plan("2027", ["XYZ9999", "FIT1045"])
  assert.deepEqual(run(state, []), { "2027": ["XYZ9999", "FIT1045"] })
  assert.deepEqual(run(state, [], [emptyKey("2027", "XYZ9999")]), {
    "2027": ["FIT1045"],
  })
  // Only that year: the same code in a 2026 slot is still requested.
  assert.deepEqual(
    run(plan("2026", ["XYZ9999"]), [], [emptyKey("2027", "XYZ9999")]),
    { "2026": ["XYZ9999"] }
  )
})

test("hydration: isFreshFor", () => {
  assert.equal(isFreshFor(undefined, "2027"), false)
  assert.equal(isFreshFor({ year: "2027" }, "2027"), true)
  assert.equal(isFreshFor({ year: "2026" }, "2027"), false)
  assert.equal(isFreshFor({ year: "2026", fallbackFor: "2027" }, "2027"), true)
})
