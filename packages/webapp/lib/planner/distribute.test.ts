import { test } from "node:test"
import assert from "node:assert/strict"

import { distribute } from "./distribute.ts"
import { defaultState } from "./state.ts"
import type { PlannerOffering, PlannerUnit, RequisiteBlock } from "./types.ts"

function unit(code: string, level = "Level 1"): PlannerUnit {
  return {
    year: "2026",
    code,
    title: code,
    creditPoints: 6,
    level,
    synopsis: null,
    school: null,
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
