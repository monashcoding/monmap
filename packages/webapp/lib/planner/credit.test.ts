import { test } from "node:test"
import assert from "node:assert/strict"

import {
  creditedCodes,
  creditEntryLabel,
  creditPointsFromCredit,
} from "./credit.ts"
import { defaultState } from "./state.ts"
import type { PlannerState } from "./types.ts"

const withCredit = (credit: PlannerState["credit"]): PlannerState => ({
  ...defaultState("2026", "C2000"),
  credit,
})

test("credit: specified entries expose their codes, block credit doesn't", () => {
  const s = withCredit([
    { code: "FIT1045", creditPoints: 6, label: "VCE Algorithmics" },
    { code: null, creditPoints: 24, label: "Deakin transfer" },
  ])
  assert.deepEqual([...creditedCodes(s)], ["FIT1045"])
})

test("credit: credit points sum across both flavours", () => {
  const s = withCredit([
    { code: "FIT1045", creditPoints: 6 },
    { code: null, creditPoints: 24 },
  ])
  assert.equal(creditPointsFromCredit(s), 30)
})

test("credit: a unit both credited and placed is counted once", () => {
  const s = withCredit([{ code: "FIT1045", creditPoints: 6 }])
  assert.equal(creditPointsFromCredit(s, new Set(["FIT1045"])), 0)
  assert.equal(creditPointsFromCredit(s, new Set(["FIT1008"])), 6)
})

test("credit: a plan with no credit is unaffected", () => {
  const s = defaultState("2026", "C2000")
  assert.equal(creditedCodes(s).size, 0)
  assert.equal(creditPointsFromCredit(s), 0)
})

test("credit: labels fall back sensibly", () => {
  assert.equal(
    creditEntryLabel({ code: "FIT1045", creditPoints: 6 }),
    "FIT1045"
  )
  assert.equal(
    creditEntryLabel({
      code: null,
      creditPoints: 24,
      label: "Deakin transfer",
    }),
    "Deakin transfer"
  )
  assert.equal(
    creditEntryLabel({ code: null, creditPoints: 24 }),
    "24cp credit"
  )
})
