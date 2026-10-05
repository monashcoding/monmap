import { test } from "node:test"
import assert from "node:assert/strict"

import { slotUsedWeight } from "./capacity.ts"
import { distribute } from "./distribute.ts"
import { defaultState, plannerReducer } from "./state.ts"
import { coreq, offering, prereq, unit } from "./test-fixtures.ts"
import type { PlannerOffering, PlannerUnit, RequisiteBlock } from "./types.ts"

const lvl = (level: string, creditPoints = 6) => ({ level, creditPoints })

function termOffering(code: string, period = "Term 2"): PlannerOffering {
  return offering(code, "OTHER", {
    teachingPeriod: period,
    attendanceModeCode: "IMMERSIVE",
  })
}

const s1s2 = (code: string) => [offering(code, "S1"), offering(code, "S2")]

/**
 * Real-world repro: comp sci 2026 "Load all" pulls four Level-1 cores,
 * with FIT1045 a prereq of FIT1008. Pre-fix, the level-only sort plus
 * "S1 first when slots tied" combo put FIT1008 in S1 ahead of its own
 * prereq.
 */
test("FIT1008 lands after FIT1045 when both are bulk-loaded", () => {
  const state = defaultState("2026", "C2000", 3)
  const units = new Map<string, PlannerUnit>([
    ["FIT1008", unit("FIT1008", lvl("Level 1"))],
    ["FIT1045", unit("FIT1045", lvl("Level 1"))],
    ["FIT1047", unit("FIT1047", lvl("Level 1"))],
    ["FIT1058", unit("FIT1058", lvl("Level 1"))],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT1008", s1s2("FIT1008")],
    ["FIT1045", s1s2("FIT1045")],
    ["FIT1047", s1s2("FIT1047")],
    ["FIT1058", s1s2("FIT1058")],
  ])
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT1008", [prereq("FIT1045", "FIT1058")]],
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
    ["FIT1008", unit("FIT1008", lvl("Level 1"))],
    ["FIT1045", unit("FIT1045", lvl("Level 1"))],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT1008", s1s2("FIT1008")],
    ["FIT1045", s1s2("FIT1045")],
  ])
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT1008", [prereq("FIT1045")]],
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
    ["FIT3045", unit("FIT3045", lvl("Level 3", 18))],
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
 * 0 CP IBL onboarding units (FIT3201 and friends) still sit in the
 * grid as cards, one column each, so auto-fill counts them the way the
 * grid does. Four of them fill a 4-wide S1; the next unit goes to S2
 * rather than making S1 read 5/4.
 */
test("0 CP companions take a column, as the grid counts them", () => {
  const state = defaultState("2026", "C2001", 3)
  state.years[0].slots[0].unitCodes = [
    "FIT2108",
    "FIT3201",
    "FIT3202",
    "FIT2110",
  ]

  const units = new Map<string, PlannerUnit>([
    ["FIT2108", unit("FIT2108", lvl("Level 2", 0))],
    ["FIT3201", unit("FIT3201", lvl("Level 3", 0))],
    ["FIT3202", unit("FIT3202", lvl("Level 3", 0))],
    ["FIT2110", unit("FIT2110", lvl("Level 2", 0))],
    ["FIT1045", unit("FIT1045", lvl("Level 1", 6))],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT2108", [offering("FIT2108", "S1")]],
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

  assert.deepEqual(placements, [
    { code: "FIT1045", yearIndex: 0, slotIndex: 1 },
  ])
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
    ["FIT3045", unit("FIT3045", lvl("Level 3", 18))],
    ["FIT1045", unit("FIT1045", lvl("Level 1", 6))],
    ["FIT1047", unit("FIT1047", lvl("Level 1", 6))],
    ["FIT1058", unit("FIT1058", lvl("Level 1", 6))],
    ["FIT1008", unit("FIT1008", lvl("Level 1", 6))],
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
    ["FIT3202", unit("FIT3202", lvl("Level 3", 0))],
    ["FIT3045", unit("FIT3045", lvl("Level 3", 18))],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT3202", [termOffering("FIT3202", "Term 1")]],
    [
      "FIT3045",
      [termOffering("FIT3045", "Term 2"), termOffering("FIT3045", "Term 4")],
    ],
  ])
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT3045", [prereq("FIT3202")]],
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

/**
 * Honours thesis chain: FIT4441 → FIT4442 → FIT4443 → FIT4444 are
 * linked by *corequisites* in the handbook, not prerequisites. The
 * load-balancer used to drop coreq edges, putting part 3 in S1 ahead
 * of part 2 in S2 — the exact bug surfaced in the screenshot.
 *
 * With coreq same-or-later semantics, every part must land in the
 * same slot as or after the previous one in the chain.
 */
test("honours thesis coreq chain stays in semester order", () => {
  // Six years of slots so a 4-deep chain has room to spread even when
  // each placement gets bumped to S2 / next year.
  const state = defaultState("2026", "C2000", 6)
  const units = new Map<string, PlannerUnit>([
    ["FIT4441", unit("FIT4441", lvl("Level 4", 6))],
    ["FIT4442", unit("FIT4442", lvl("Level 4", 6))],
    ["FIT4443", unit("FIT4443", lvl("Level 4", 6))],
    ["FIT4444", unit("FIT4444", lvl("Level 4", 6))],
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT4441", s1s2("FIT4441")],
    ["FIT4442", s1s2("FIT4442")],
    ["FIT4443", s1s2("FIT4443")],
    ["FIT4444", s1s2("FIT4444")],
  ])
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT4442", [coreq("FIT4441")]],
    ["FIT4443", [coreq("FIT4442")]],
    ["FIT4444", [coreq("FIT4443")]],
  ])

  const { placements } = distribute({
    codes: ["FIT4441", "FIT4442", "FIT4443", "FIT4444"],
    units,
    offerings,
    state,
    requisites,
  })

  const where = new Map(placements.map((p) => [p.code, p]))
  const rank = (code: string) => {
    const p = where.get(code)!
    return p.yearIndex * 10 + p.slotIndex
  }
  // Same-or-later for every consecutive pair — never strictly earlier.
  assert.ok(rank("FIT4442") >= rank("FIT4441"), "part 2 ≥ part 1")
  assert.ok(rank("FIT4443") >= rank("FIT4442"), "part 3 ≥ part 2")
  assert.ok(rank("FIT4444") >= rank("FIT4443"), "final ≥ part 3")
  // The original bug: part 3 in S1 alongside part 1, before part 2 in S2.
  assert.ok(
    rank("FIT4443") > rank("FIT4441"),
    "part 3 must follow part 1, not sit alongside it"
  )
})

test("no requisites map → preserves the level-only ordering", () => {
  // Sanity check: existing callers that don't pass `requisites` get
  // the prior behaviour unchanged.
  const state = defaultState("2026", "C2000", 3)
  const units = new Map<string, PlannerUnit>([
    ["FIT1045", unit("FIT1045", lvl("Level 1"))],
    ["FIT2004", unit("FIT2004", lvl("Level 2"))],
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

test("a credited unit is skipped, not placed again", () => {
  const state = defaultState("2026", "C2000", 3)
  state.credit = [{ code: "FIT1045", creditPoints: 6 }]
  const units = new Map([["FIT1045", unit("FIT1045", lvl("Level 1"))]])
  const offerings = new Map([["FIT1045", s1s2("FIT1045")]])

  const res = distribute({ codes: ["FIT1045"], units, offerings, state })

  assert.deepEqual(res.placements, [])
  assert.deepEqual(res.skipped, ["FIT1045"])
  assert.deepEqual(res.unplaced, [])
})

test("leave, exchange and locked semesters take no units", () => {
  let state = defaultState("2026", "C2000", 1)
  state = plannerReducer(state, {
    type: "set_slot_status",
    yearIndex: 0,
    slotIndex: 0,
    status: "leave",
  })
  state = plannerReducer(state, {
    type: "toggle_slot_lock",
    yearIndex: 0,
    slotIndex: 1,
  })
  const units = new Map([["FIT1045", unit("FIT1045", lvl("Level 1"))]])
  const offerings = new Map([["FIT1045", s1s2("FIT1045")]])

  const { placements } = distribute({
    codes: ["FIT1045"],
    units,
    offerings,
    state,
  })

  // Both Year 1 semesters are out, so it lands in the first overflow
  // year, which bulk_load adds.
  assert.deepEqual(placements, [
    { code: "FIT1045", yearIndex: 1, slotIndex: 0 },
  ])
})

test("units that don't fit spill into overflow years, then report as unplaced", () => {
  // One year, so with four overflow years there are 5 × 8 = 40 seats.
  const state = defaultState("2026", "C2000", 1)
  const codes = Array.from({ length: 44 }, (_, i) => `FIT1${100 + i}`)
  const units = new Map(codes.map((c) => [c, unit(c, lvl("Level 1"))]))
  const offerings = new Map(codes.map((c) => [c, s1s2(c)]))

  const res = distribute({ codes, units, offerings, state })

  assert.equal(res.placements.length, 40)
  assert.equal(Math.max(...res.placements.map((p) => p.yearIndex)), 4)
  assert.equal(res.unplaced.length, 4)
  // Nothing is lost: every code is placed, skipped or reported.
  assert.equal(
    new Set(res.placements.map((p) => p.code)).size + res.unplaced.length,
    codes.length
  )
  // The placements load cleanly: bulk_load grows the plan to five years.
  const after = plannerReducer(state, {
    type: "bulk_load",
    placements: res.placements,
    mode: "merge",
  })
  assert.equal(after.years.length, 5)
})

test("a full-year unit gives two placements for one code", () => {
  const state = defaultState("2026", "C2000", 3)
  const units = new Map([["FIT2099", unit("FIT2099", lvl("Level 1", 12))]])
  const offerings = new Map([["FIT2099", [offering("FIT2099", "FULL_YEAR")]]])

  const { placements } = distribute({
    codes: ["FIT2099"],
    units,
    offerings,
    state,
  })

  assert.deepEqual(placements, [
    { code: "FIT2099", yearIndex: 0, slotIndex: 0 },
    { code: "FIT2099", yearIndex: 0, slotIndex: 1 },
  ])
  assert.equal(new Set(placements.map((p) => p.code)).size, 1)
})

test("an 18 CP term-only unit plus fillers never overfills a semester", () => {
  // The grid counts an OTHER-only 18 CP unit as 3 columns in each
  // half; auto-fill used to count it as 2 and add one unit too many.
  const state = defaultState("2026", "C2001", 1)
  const fillers = ["FIT1045", "FIT1047", "FIT1058", "FIT1008"]
  const units = new Map<string, PlannerUnit>([
    ["FIT3045", unit("FIT3045", lvl("Level 1", 18))],
    ...fillers.map((c): [string, PlannerUnit] => [c, unit(c, lvl("Level 1"))]),
  ])
  const offerings = new Map<string, PlannerOffering[]>([
    ["FIT3045", [termOffering("FIT3045")]],
    ...fillers.map((c): [string, PlannerOffering[]] => [c, s1s2(c)]),
  ])

  const { placements } = distribute({
    codes: ["FIT3045", ...fillers],
    units,
    offerings,
    state,
  })
  const after = plannerReducer(state, {
    type: "bulk_load",
    placements,
    mode: "merge",
  })

  for (const year of after.years)
    for (const slot of year.slots)
      assert.ok(
        slotUsedWeight(slot, units, offerings) <= 4,
        `${slot.kind} holds ${slot.unitCodes.join(", ")}`
      )
})
