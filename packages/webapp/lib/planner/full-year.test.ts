import { test } from "node:test"
import assert from "node:assert/strict"

import {
  countFullYearPrefix,
  isFullYearUnit,
  isYearLongUnit,
  perSlotCreditPoints,
} from "./full-year.ts"
import { offering, offeringMap, unitMap } from "./test-fixtures.ts"

test("isFullYearUnit: only FULL_YEAR offerings, with summer allowed alongside", () => {
  const offerings = offeringMap({
    FY: ["FULL_YEAR"],
    FY_SUMMER: ["FULL_YEAR", "SUMMER_A"],
    FY_OR_S1: ["FULL_YEAR", "S1"],
    S1: ["S1"],
    NONE: [],
  })
  assert.equal(isFullYearUnit("FY", offerings), true)
  assert.equal(isFullYearUnit("FY_SUMMER", offerings), true)
  assert.equal(isFullYearUnit("FY_OR_S1", offerings), false)
  assert.equal(isFullYearUnit("S1", offerings), false)
  assert.equal(isFullYearUnit("NONE", offerings), false)
  assert.equal(isFullYearUnit("UNLOADED", offerings), false)
})

test("isYearLongUnit: true FY units and credit-bearing term-only units", () => {
  const term = [offering("IBL", "OTHER")]
  assert.equal(isYearLongUnit([offering("FY", "FULL_YEAR")], 12), true)
  assert.equal(isYearLongUnit(term, 18), true)
  assert.equal(isYearLongUnit(term, 12), true)
  // A 6 or 0 CP term-only unit (onboarding, a seminar) is not.
  assert.equal(isYearLongUnit(term, 6), false)
  assert.equal(isYearLongUnit(term, 0), false)
  assert.equal(
    isYearLongUnit([offering("X", "FULL_YEAR"), offering("X", "S2")], 12),
    false
  )
  assert.equal(isYearLongUnit([], 18), false)
})

test("countFullYearPrefix counts FY codes at the front only", () => {
  const fy = new Set(["A", "B"])
  assert.equal(countFullYearPrefix(["A", "B", "X", "A"], fy), 2)
  assert.equal(countFullYearPrefix(["X", "A"], fy), 0)
  assert.equal(countFullYearPrefix([], fy), 0)
})

test("perSlotCreditPoints halves a FY twin in S1/S2 only", () => {
  const units = new Map([
    ...unitMap(["FY"], { creditPoints: 12 }),
    ...unitMap(["S1U"]),
    ...unitMap(["ZERO"], { creditPoints: 0 }),
  ])
  const offerings = offeringMap({ FY: ["FULL_YEAR"], S1U: ["S1"] })
  assert.equal(perSlotCreditPoints("FY", "S1", units, offerings), 6)
  assert.equal(perSlotCreditPoints("FY", "S2", units, offerings), 6)
  assert.equal(perSlotCreditPoints("FY", "SUMMER_A", units, offerings), 12)
  assert.equal(perSlotCreditPoints("S1U", "S1", units, offerings), 6)
  assert.equal(perSlotCreditPoints("ZERO", "S1", units, offerings), 0)
  assert.equal(perSlotCreditPoints("UNLOADED", "S1", units, offerings), 0)
})
