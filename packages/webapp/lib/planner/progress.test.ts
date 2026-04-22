import { test } from "node:test"
import assert from "node:assert/strict"

import {
  plannedUnitCodes,
  summarizeAoSProgress,
  summarizePlan,
} from "./progress.ts"
import type {
  PlannerAreaOfStudy,
  PlannerCourseWithAoS,
  PlannerState,
  PlannerUnit,
} from "./types.ts"

function unit(code: string, cp = 6): PlannerUnit {
  return {
    year: "2026",
    code,
    title: code,
    creditPoints: cp,
    level: null,
    synopsis: null,
    school: null,
  }
}

function emptyState(): PlannerState {
  return {
    courseYear: "2026",
    courseCode: "C2000",
    selectedAos: {},
    years: [
      {
        label: "Year 1",
        slots: [
          { kind: "S1", unitCodes: [] },
          { kind: "S2", unitCodes: [] },
        ],
      },
      {
        label: "Year 2",
        slots: [
          { kind: "S1", unitCodes: [] },
          { kind: "S2", unitCodes: [] },
        ],
      },
    ],
  }
}

const bit: PlannerCourseWithAoS = {
  year: "2026",
  code: "C2000",
  title: "Bachelor of Information Technology",
  creditPoints: 144,
  aqfLevel: null,
  type: null,
  overview: null,
  areasOfStudy: [],
  courseUnits: [],
  courseRequirements: [],
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

test("summarizePlan: detects duplicate unit placements", () => {
  const state = emptyState()
  state.years[0].slots[0].unitCodes = ["FIT1045"]
  state.years[1].slots[0].unitCodes = ["FIT1045"]

  const s = summarizePlan(state, bit, new Map([["FIT1045", unit("FIT1045")]]))
  assert.deepEqual(s.duplicateUnitCodes, ["FIT1045"])
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
