import { test } from "node:test"
import assert from "node:assert/strict"

import {
  canPlaceUnit,
  inLockedSlot,
  slotCreditPoints,
  slotTakesUnits,
  slotUsedWeight,
  unitSlotWeight,
} from "./capacity.ts"
import { offeringMap, planState, unitMap } from "./test-fixtures.ts"

const units = new Map([
  ...unitMap(["A", "B", "C", "D"]),
  ...unitMap(["FY12"], { creditPoints: 12 }),
  ...unitMap(["FY18"], { creditPoints: 18 }),
  ...unitMap(["IBL"], { creditPoints: 18 }),
  ...unitMap(["ZERO"], { creditPoints: 0 }),
])
const offerings = offeringMap({
  A: ["S1", "S2"],
  FY12: ["FULL_YEAR"],
  FY18: ["FULL_YEAR"],
  IBL: ["OTHER"],
  ZERO: ["OTHER"],
})

test("unitSlotWeight: 6 CP is one column", () => {
  assert.equal(unitSlotWeight("A", "S1", units, offerings), 1)
  // A 0 CP companion still takes a column: it is a card in the grid.
  assert.equal(unitSlotWeight("ZERO", "S1", units, offerings), 1)
  // Unloaded units count as a standard unit until their data arrives.
  assert.equal(unitSlotWeight("UNLOADED", "S1", units, offerings), 1)
  // An 18 CP term-only unit is not a FY twin: 3 columns wherever it sits.
  assert.equal(unitSlotWeight("IBL", "S1", units, offerings), 3)
})

test("unitSlotWeight: a FY twin weighs half in S1/S2, in full elsewhere", () => {
  assert.equal(unitSlotWeight("FY12", "S1", units, offerings), 1)
  assert.equal(unitSlotWeight("FY12", "S2", units, offerings), 1)
  assert.equal(unitSlotWeight("FY18", "S1", units, offerings), 2)
  assert.equal(unitSlotWeight("FY12", "SUMMER_A", units, offerings), 2)
  // Without offerings the twin can't be recognised and counts in full.
  assert.equal(unitSlotWeight("FY12", "S1", units), 2)
})

test("slotUsedWeight and slotCreditPoints sum a slot", () => {
  const slot = { kind: "S1" as const, unitCodes: ["A", "FY12", "ZERO"] }
  assert.equal(slotUsedWeight(slot, units, offerings), 3)
  assert.equal(slotCreditPoints(slot, units, offerings), 12)
  assert.equal(
    slotCreditPoints(
      { kind: "S2", unitCodes: [], status: "exchange", creditPoints: 18 },
      units,
      offerings
    ),
    18
  )
})

test("slotTakesUnits: false for leave, exchange and locked", () => {
  assert.equal(slotTakesUnits({}), true)
  assert.equal(slotTakesUnits({ status: "leave" }), false)
  assert.equal(slotTakesUnits({ status: "exchange" }), false)
  assert.equal(slotTakesUnits({ locked: true }), false)
})

test("canPlaceUnit: the reasons a slot refuses a unit", () => {
  const state = planState([
    {
      S1: ["A", "B", "C", "D"],
      S2: [],
      SUMMER_A: { unitCodes: [], locked: true },
      WINTER: { unitCodes: [], status: "leave" },
    },
  ])
  const place = (slotIndex: number, code: string) =>
    canPlaceUnit(state, 0, slotIndex, code, units, offerings)
  assert.deepEqual(place(1, "X"), { ok: true })
  assert.deepEqual(place(0, "X"), { ok: false, reason: "full" })
  assert.deepEqual(place(0, "A"), { ok: false, reason: "duplicate" })
  assert.deepEqual(place(9, "X"), { ok: false, reason: "missing" })
  const kinds = state.years[0].slots.map((s) => s.kind)
  assert.deepEqual(place(kinds.indexOf("SUMMER_A"), "X"), {
    ok: false,
    reason: "locked",
  })
  assert.deepEqual(place(kinds.indexOf("WINTER"), "X"), {
    ok: false,
    reason: "leave",
  })
})

test("canPlaceUnit: a FY unit needs room in both S1 and S2", () => {
  const free = planState([{ S1: [], S2: [] }])
  assert.deepEqual(canPlaceUnit(free, 0, 0, "FY12", units, offerings), {
    ok: true,
  })

  // Picking S1 is refused when S2, where the other half goes, is out.
  const s2Away = planState([
    { S1: [], S2: { unitCodes: [], status: "exchange", creditPoints: 24 } },
  ])
  assert.deepEqual(canPlaceUnit(s2Away, 0, 0, "FY12", units, offerings), {
    ok: false,
    reason: "exchange",
  })

  const s2Full = planState([{ S1: [], S2: ["A", "B", "C", "D"] }])
  assert.deepEqual(canPlaceUnit(s2Full, 0, 0, "FY12", units, offerings), {
    ok: false,
    reason: "full",
  })

  const halfYear = planState([{ S1: [] }])
  assert.deepEqual(canPlaceUnit(halfYear, 0, 0, "FY12", units, offerings), {
    ok: false,
    reason: "no_twin",
  })

  const placed = planState([{ S1: ["FY12"], S2: ["FY12"] }])
  assert.deepEqual(canPlaceUnit(placed, 0, 1, "FY12", units, offerings), {
    ok: false,
    reason: "duplicate",
  })
})

test("inLockedSlot: a lock on either half pins a full-year unit", () => {
  const st = planState([
    { S1: ["FY12", "A"], S2: { unitCodes: ["FY12"], locked: true } },
  ])
  const year = st.years[0]
  assert.equal(inLockedSlot(year, "FY12"), true)
  // From the S1 card, the S2 lock still counts.
  assert.equal(inLockedSlot(year, "FY12", 0), true)
  // From the locked S2 card itself, only other slots count.
  assert.equal(inLockedSlot(year, "FY12", 1), false)
  assert.equal(inLockedSlot(year, "A"), false)
  assert.equal(inLockedSlot(undefined, "FY12"), false)
})
