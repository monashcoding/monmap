import { test } from "node:test"
import assert from "node:assert/strict"

import {
  groupProgress,
  placedUnitCodes,
  plannedUnitCodes,
  summarizeAoSProgress,
  summarizeGroups,
  summarizePlan,
} from "./progress.ts"
import { offeringMap, planState, unit as fixtureUnit } from "./test-fixtures.ts"
import type { PlannerAreaOfStudy, PlannerCourseWithAoS } from "./types.ts"

const unit = (code: string, creditPoints = 6) =>
  fixtureUnit(code, { creditPoints })

const emptyState = () =>
  planState([
    { S1: [], S2: [] },
    { S1: [], S2: [] },
  ])

const bit: PlannerCourseWithAoS = {
  year: "2026",
  code: "C2000",
  title: "Bachelor of Information Technology",
  creditPoints: 144,
  aqfLevel: null,
  type: null,
  areasOfStudy: [],
  courseUnits: [],
  courseRequirements: [],
  componentCourses: [],
}

test("summarizePlan: totals 0 for empty plan", () => {
  const s = summarizePlan(emptyState(), bit, new Map())
  assert.equal(s.totalCreditPoints, 0)
  assert.equal(s.targetCreditPoints, 144)
  assert.deepEqual(s.creditPointsByYear, [0, 0])
})

test("summarizePlan: counts credit points per year and slot kind", () => {
  const state = emptyState()
  state.years[0].slots[0].unitCodes = ["FIT1045", "FIT1008"]
  state.years[0].slots[1].unitCodes = ["FIT2004"]
  state.years[1].slots[0].unitCodes = ["FIT3171"]

  const units = new Map([
    ["FIT1045", unit("FIT1045")],
    ["FIT1008", unit("FIT1008")],
    ["FIT2004", unit("FIT2004")],
    ["FIT3171", unit("FIT3171")],
  ])

  const s = summarizePlan(state, bit, units)
  assert.equal(s.totalCreditPoints, 24)
  assert.deepEqual(s.creditPointsByYear, [18, 6])
  assert.equal(s.creditPointsBySlotKind.S1, 18)
  assert.equal(s.creditPointsBySlotKind.S2, 6)
  assert.equal(s.uniqueUnitCount, 4)
  assert.deepEqual(s.duplicateUnitCodes, [])
})

test("summarizePlan: full-year twin contributes half its CP to each semester", () => {
  // FIT3144-shape: 12 CP, only-full-year offering, placed in both
  // S1[0] and S2[0] of year 1 by the add_full_year_unit reducer.
  const state = emptyState()
  state.years[0].slots[0].unitCodes = ["FIT3144"]
  state.years[0].slots[1].unitCodes = ["FIT3144"]

  const units = new Map([["FIT3144", unit("FIT3144", 12)]])
  const offerings = offeringMap({ FIT3144: ["FULL_YEAR"] })

  const s = summarizePlan(state, bit, units, offerings)
  // Degree total counts the unit once, not twice.
  assert.equal(s.totalCreditPoints, 12)
  assert.deepEqual(s.creditPointsByYear, [12, 0])
  // Per-slot view splits the workload across the year.
  assert.equal(s.creditPointsBySlotKind.S1, 6)
  assert.equal(s.creditPointsBySlotKind.S2, 6)
  // Both twins resolve to the same unit, so no duplicate flag.
  assert.deepEqual(s.duplicateUnitCodes, [])
  assert.equal(s.uniqueUnitCount, 1)
})

test("summarizePlan: reports a repeated unit and credits it once", () => {
  // Retaking a failed unit: same code in two different years. The
  // repeat is reported so an accidental double-add stays visible, but
  // it must not inflate the degree total — you don't earn the credit
  // points twice.
  const state = emptyState()
  state.years[0].slots[0].unitCodes = ["FIT1045"]
  state.years[1].slots[0].unitCodes = ["FIT1045"]

  const s = summarizePlan(state, bit, new Map([["FIT1045", unit("FIT1045")]]))
  assert.deepEqual(s.duplicateUnitCodes, ["FIT1045"])
  assert.equal(s.totalCreditPoints, 6, "credited once, not twice")
  assert.equal(s.creditPointsByYear[1], 0, "the retake year earns nothing")
  assert.equal(s.uniqueUnitCount, 1)
})

test("summarizePlan: ignores unknown codes (credit points = 0)", () => {
  const state = emptyState()
  state.years[0].slots[0].unitCodes = ["ZZZ9999"]
  const s = summarizePlan(state, bit, new Map())
  assert.equal(s.totalCreditPoints, 0)
})

test("summarizePlan: uses default target when course is null", () => {
  const s = summarizePlan(emptyState(), null, new Map())
  assert.equal(s.targetCreditPoints, 144)
})

test("plannedUnitCodes: collects across all slots", () => {
  const state = emptyState()
  state.years[0].slots[0].unitCodes = ["A", "B"]
  state.years[1].slots[1].unitCodes = ["C"]
  assert.deepEqual([...plannedUnitCodes(state)].sort(), ["A", "B", "C"])
})

test("summarizeAoSProgress: splits placed vs remaining", () => {
  const aos: PlannerAreaOfStudy = {
    code: "SFTWRDEV08",
    title: "Software development major",
    kind: "major",
    relationshipLabel: "Part B. Major studies",
    creditPoints: 48,
    units: [
      { code: "FIT1050", grouping: "Core units" },
      { code: "FIT1051", grouping: "Core units" },
      { code: "FIT2081", grouping: "Core units" },
      { code: "FIT3077", grouping: "Core units" },
    ],
    requiredUnits: [
      { code: "FIT1050", grouping: "Core units" },
      { code: "FIT1051", grouping: "Core units" },
      { code: "FIT2081", grouping: "Core units" },
      { code: "FIT3077", grouping: "Core units" },
    ],
    requirements: [
      {
        grouping: "Core units",
        required: 4,
        options: ["FIT1050", "FIT1051", "FIT2081", "FIT3077"],
      },
    ],
  }
  const units = new Map([
    ["FIT1050", unit("FIT1050")],
    ["FIT1051", unit("FIT1051")],
  ])

  const p = summarizeAoSProgress(aos, new Set(["FIT1050", "FIT1051"]), units)
  assert.deepEqual(p.completedCodes, ["FIT1050", "FIT1051"])
  assert.equal(p.plannedCreditPoints, 12)
  assert.deepEqual(
    p.remainingCodes.map((r) => r.code),
    ["FIT2081", "FIT3077"]
  )
})

test("summarizePlan: advanced standing adds credit points but no semester load", () => {
  const state = emptyState()
  state.years[0].slots[0].unitCodes = ["FIT1045"]
  state.credit = [
    { code: "FIT1008", creditPoints: 6, label: "transfer" },
    { code: null, creditPoints: 24, label: "unspecified elective credit" },
  ]
  const s = summarizePlan(state, bit, new Map([["FIT1045", unit("FIT1045")]]))
  assert.equal(s.totalCreditPoints, 36, "6 placed + 6 credited + 24 block")
  assert.equal(
    s.creditPointsBySlotKind.S1,
    6,
    "credit carries no teaching load"
  )
  assert.equal(s.creditPointsByYear[0], 6)
})

test("plannedUnitCodes: credited units count as held", () => {
  const state = emptyState()
  state.years[0].slots[0].unitCodes = ["FIT1045"]
  state.credit = [
    { code: "FIT1008", creditPoints: 6 },
    { code: null, creditPoints: 24 },
  ]
  assert.deepEqual([...plannedUnitCodes(state)].sort(), ["FIT1008", "FIT1045"])
  assert.deepEqual([...placedUnitCodes(state)], ["FIT1045"])
})

/* ------------------------------------------------------------------ *
 * Requirement groups and the reachability cap
 * ------------------------------------------------------------------ */

// L3005's shape: a "6 of these 7" group where BTC1110 prohibits
// LAW2102, so once BTC1110 is placed only six options are reachable.
const sevenGroup = {
  grouping: "Commerce Part A",
  required: 7,
  options: ["BTC1110", "LAW2102", "A", "B", "C", "D", "E"],
}
const conflicts = { LAW2102: ["BTC1110"], BTC1110: ["LAW2102"] }

test("groupProgress caps the target at the reachable options", () => {
  const planned = new Set(["BTC1110", "A", "B", "C", "D", "E"])
  assert.deepEqual(groupProgress(sevenGroup, planned, conflicts), {
    group: sevenGroup,
    required: 6,
    placed: 6,
    satisfied: true,
  })
  // Without the conflict data the old, unreachable target stands.
  assert.equal(groupProgress(sevenGroup, planned).satisfied, false)
})

test("summarizeGroups totals each group's capped progress", () => {
  const other = { grouping: "Core", required: 2, options: ["X", "Y", "Z"] }
  const planned = new Set(["BTC1110", "A", "X", "Y", "Z"])
  const sum = summarizeGroups([sevenGroup, other], planned, conflicts)
  assert.equal(sum.totalRequired, 6 + 2)
  // 2 of 6 in the first group; the second counts at most its 2.
  assert.equal(sum.satisfiedCount, 2 + 2)
  assert.deepEqual(
    sum.groups.map((g) => g.satisfied),
    [false, true]
  )
})
