import { test } from "node:test"
import assert from "node:assert/strict"

import { distribute } from "./distribute.ts"
import { defaultState } from "./state.ts"
import type { PlannerOffering, PlannerUnit, RequisiteBlock } from "./types.ts"

function unit(code: string, level = "Level 1", creditPoints = 6): PlannerUnit {
  return {
    year: "2026",
    code,
    title: code,
    creditPoints,
    level,
    synopsis: null,
    school: null,
  }
}

function termOffering(code: string, period = "Term 2"): PlannerOffering {
  return {
    unitCode: code,
    teachingPeriod: period,
    location: "Clayton",
    attendanceModeCode: "IMMERSIVE",
    periodKind: "OTHER",
  }
}

function s1s2(code: string): PlannerOffering[] {
  return [
    {
      unitCode: code,
      teachingPeriod: "First semester",
      location: "Clayton",
      attendanceModeCode: "ON-CAMPUS",
      periodKind: "S1",
    },
    {
      unitCode: code,
      teachingPeriod: "Second semester",
      location: "Clayton",
      attendanceModeCode: "ON-CAMPUS",
      periodKind: "S2",
    },
  ]
}

function prereqBlock(codes: string[]): RequisiteBlock {
  return {
    requisiteType: "prerequisite",
    rule: [
      {
        parent_connector: { value: "AND", label: "AND" },
        relationships: codes.map((c) => ({ academic_item_code: c })),
      },
    ],
  }
}

/**
 * Real-world repro: comp sci 2026 "Load all" pulls four Level-1 cores,
 * with FIT1045 a prereq of FIT1008. Pre-fix, the level-only sort plus
 * "S1 first when slots tied" combo put FIT1008 in S1 ahead of its own
 * prereq.
 */
test("FIT1008 lands after FIT1045 when both are bulk-loaded", () => {
  const state = defaultState("2026", "C2000", 3)
  const units = new Map<string, PlannerUnit>([
    ["FIT1008", unit("FIT1008")],
    ["FIT1045", unit("FIT1045")],
    ["FIT1047", unit("FIT1047")],
    ["FIT1058", unit("FIT1058")],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT1008", s1s2("FIT1008")],
    ["FIT1045", s1s2("FIT1045")],
    ["FIT1047", s1s2("FIT1047")],
    ["FIT1058", s1s2("FIT1058")],
  ])
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT1008", [prereqBlock(["FIT1045", "FIT1058"])]],
  ])

  const { placements } = distribute({
    // Original insertion order from the screenshot — FIT1008 first.
    codes: ["FIT1008", "FIT1047", "FIT1045", "FIT1058"],
    units,
    offerings,
    state,
    requisites,
  })

  const where = new Map(placements.map((p) => [p.code, p]))
  const fit1045 = where.get("FIT1045")!
  const fit1008 = where.get("FIT1008")!

  // FIT1045 in year 1 S1 (yearIndex 0, slotIndex 0).
  assert.equal(fit1045.yearIndex, 0)
  assert.equal(fit1045.slotIndex, 0)
  // FIT1008 strictly *after* FIT1045 in the (year, slot) ordering.
  const rank = (yi: number, si: number) => yi * 10 + si
  assert.ok(
    rank(fit1008.yearIndex, fit1008.slotIndex) >
      rank(fit1045.yearIndex, fit1045.slotIndex),
    `FIT1008 (${fit1008.yearIndex}:${fit1008.slotIndex}) must follow FIT1045 (${fit1045.yearIndex}:${fit1045.slotIndex})`
  )
})

test("prereq already on the plan still constrains new placements", () => {
  // FIT1045 sits in S2 of year 1; FIT1008 must land in year 2 S1 or
  // later, never in year 1 alongside or before its prereq.
  const state = defaultState("2026", "C2000", 3)
  state.years[0].slots[1].unitCodes = ["FIT1045"]

  const units = new Map<string, PlannerUnit>([
    ["FIT1008", unit("FIT1008")],
    ["FIT1045", unit("FIT1045")],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT1008", s1s2("FIT1008")],
    ["FIT1045", s1s2("FIT1045")],
  ])
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT1008", [prereqBlock(["FIT1045"])]],
  ])

  const { placements } = distribute({
    codes: ["FIT1008"],
    units,
    offerings,
    state,
    requisites,
  })

  assert.equal(placements.length, 1)
  assert.equal(placements[0]!.code, "FIT1008")
  assert.equal(placements[0]!.yearIndex, 1, "must move to year 2")
  assert.equal(placements[0]!.slotIndex, 0, "year 2 S1")
})

/**
 * IBL placement edge case: FIT3045 is 18 CP, offered only "Term 2"
 * (which collapses to `OTHER` periodKind). Before the IBL handling
 * it would silently land in S1 or S2 of one semester. Distribute now
 * books it across both halves of the same year — the realistic
 * "student is on full-time placement" outcome.
 */
test("term-only 18 CP IBL placement books both S1 and S2 of one year", () => {
  const state = defaultState("2026", "C2001", 3)
  const units = new Map<string, PlannerUnit>([
    ["FIT3045", unit("FIT3045", "Level 3", 18)],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    [
      "FIT3045",
      [termOffering("FIT3045", "Term 2"), termOffering("FIT3045", "Term 4")],
    ],
  ])

  const { placements } = distribute({
    codes: ["FIT3045"],
    units,
    offerings,
    state,
  })

  // Two placements: same year, both S1 and S2 slots.
  assert.equal(placements.length, 2)
  const years = new Set(placements.map((p) => p.yearIndex))
  const slots = new Set(placements.map((p) => p.slotIndex))
  assert.equal(years.size, 1, "IBL placement occupies a single year")
  assert.deepEqual([...slots].sort(), [0, 1], "spans S1 and S2 of that year")
})

/**
 * 0 CP IBL onboarding (FIT3201) shouldn't burn a slot. Before the
 * weight-aware fill, four 0-CP companions would exhaust the cap-of-4
 * just by sitting on the plan. Now they contribute zero load.
 */
test("0 CP IBL companions don't consume slot capacity", () => {
  const state = defaultState("2026", "C2001", 3)
  state.years[0].slots[0].capacity = 4
  // Pre-place four 0 CP companions in Year 1 S1 — they'd hit cap-4
  // if counted, but with weight-aware fill they sum to 0.
  state.years[0].slots[0].unitCodes = [
    "FIT2108",
    "FIT3201",
    "FIT3202",
    "FIT2110",
  ]

  const units = new Map<string, PlannerUnit>([
    ["FIT2108", unit("FIT2108", "Level 2", 0)],
    ["FIT3201", unit("FIT3201", "Level 3", 0)],
    ["FIT3202", unit("FIT3202", "Level 3", 0)],
    ["FIT2110", unit("FIT2110", "Level 2", 0)],
    ["FIT1045", unit("FIT1045", "Level 1", 6)],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    [
      "FIT2108",
      [
        {
          unitCode: "FIT2108",
          teachingPeriod: "First semester",
          location: null,
          attendanceModeCode: "ONLINE",
          periodKind: "S1",
        },
      ],
    ],
    ["FIT3201", [termOffering("FIT3201", "Term 1")]],
    ["FIT3202", [termOffering("FIT3202", "Term 1")]],
    ["FIT2110", [termOffering("FIT2110", "Term 1")]],
    ["FIT1045", s1s2("FIT1045")],
  ])

  const { placements } = distribute({
    codes: ["FIT1045"],
    units,
    offerings,
    state,
  })

  // FIT1045 still fits into Year 1 S1 — the 0-CP companions don't
  // block it.
  assert.equal(placements.length, 1)
  assert.equal(placements[0]!.yearIndex, 0)
  assert.equal(placements[0]!.slotIndex, 0)
})

/**
 * 18 CP IBL placement plus four 6 CP cores in the same year shouldn't
 * all land in Year 1: the placement consumes most of the year's load,
 * leaving room for only the onboarding companion. The cores spill to
 * Year 2.
 */
test("18 CP IBL placement crowds 6 CP units out of its year", () => {
  const state = defaultState("2026", "C2001", 3)
  const units = new Map<string, PlannerUnit>([
    ["FIT3045", unit("FIT3045", "Level 3", 18)],
    ["FIT1045", unit("FIT1045", "Level 1", 6)],
    ["FIT1047", unit("FIT1047", "Level 1", 6)],
    ["FIT1058", unit("FIT1058", "Level 1", 6)],
    ["FIT1008", unit("FIT1008", "Level 1", 6)],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT3045", [termOffering("FIT3045", "Term 2")]],
    ["FIT1045", s1s2("FIT1045")],
    ["FIT1047", s1s2("FIT1047")],
    ["FIT1058", s1s2("FIT1058")],
    ["FIT1008", s1s2("FIT1008")],
  ])

  const { placements } = distribute({
    codes: ["FIT3045", "FIT1045", "FIT1047", "FIT1058", "FIT1008"],
    units,
    offerings,
    state,
  })

  const where = new Map(placements.map((p) => [p.code, p]))
  // Level 1s land in Year 1 (yi=0).
  for (const c of ["FIT1045", "FIT1047", "FIT1058", "FIT1008"]) {
    assert.equal(where.get(c)?.yearIndex, 0, `${c} in year 1`)
  }
  // FIT3045 (Level 3) lands in Year 3 (yi=2), occupying both halves —
  // *not* Year 1 alongside the cores, *not* in a single semester.
  const fit3045s = placements.filter((p) => p.code === "FIT3045")
  assert.equal(fit3045s.length, 2, "IBL placement occupies both halves")
  assert.ok(
    fit3045s.every((p) => p.yearIndex === fit3045s[0]!.yearIndex),
    "IBL placement halves share a year"
  )
})

/**
 * IBL chain in real life: FIT3202 (Term 1 onboarding, 0 CP) is a
 * prereq of FIT3045 (Term 2 placement, 18 CP). On the calendar
 * these run consecutively in the SAME year (T1: Jan–Feb, T2: Apr–
 * Aug). The S1/S2 grid can't represent that directly, so distribute
 * must avoid bumping FIT3045 to the year after FIT3202 just because
 * FIT3202 happened to land in an S1/S2 box.
 */
test("term-only prereq stays in same year as its IBL dependent", () => {
  const state = defaultState("2026", "C2001", 4)
  const units = new Map<string, PlannerUnit>([
    ["FIT3202", unit("FIT3202", "Level 3", 0)],
    ["FIT3045", unit("FIT3045", "Level 3", 18)],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT3202", [termOffering("FIT3202", "Term 1")]],
    [
      "FIT3045",
      [termOffering("FIT3045", "Term 2"), termOffering("FIT3045", "Term 4")],
    ],
  ])
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT3045", [prereqBlock(["FIT3202"])]],
  ])

  const { placements } = distribute({
    codes: ["FIT3202", "FIT3045"],
    units,
    offerings,
    state,
    requisites,
  })

  const fit3202 = placements.find((p) => p.code === "FIT3202")!
  const fit3045s = placements.filter((p) => p.code === "FIT3045")
  assert.equal(fit3045s.length, 2, "IBL placement spans both halves")
  assert.equal(
    fit3045s[0]!.yearIndex,
    fit3202.yearIndex,
    "IBL placement and its term-only onboarding share a year"
  )
})

test("no requisites map → preserves the level-only ordering", () => {
  // Sanity check: existing callers that don't pass `requisites` get
  // the prior behaviour unchanged.
  const state = defaultState("2026", "C2000", 3)
  const units = new Map<string, PlannerUnit>([
    ["FIT1045", unit("FIT1045")],
    ["FIT2004", unit("FIT2004", "Level 2")],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT1045", s1s2("FIT1045")],
    ["FIT2004", s1s2("FIT2004")],
  ])

  const { placements } = distribute({
    codes: ["FIT2004", "FIT1045"],
    units,
    offerings,
    state,
  })

  const where = new Map(placements.map((p) => [p.code, p.yearIndex]))
  assert.equal(where.get("FIT1045"), 0, "Level 1 → year 1")
  assert.equal(where.get("FIT2004"), 1, "Level 2 → year 2")
})
