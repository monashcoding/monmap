import { test } from "node:test"
import assert from "node:assert/strict"

import { planState } from "./test-fixtures.ts"
import { placedWaivers, waiversByUnit, withWaived } from "./waivers.ts"

test("waiversByUnit groups each unit's waived prerequisites", () => {
  const byUnit = waiversByUnit({
    waivers: [
      { unitCode: "AAA2000", prerequisiteCode: "AAA1000" },
      { unitCode: "AAA2000", prerequisiteCode: "AAA1001" },
      { unitCode: "AAA3000", prerequisiteCode: "AAA2000" },
    ],
  })

  assert.deepEqual([...byUnit.get("AAA2000")!], ["AAA1000", "AAA1001"])
  assert.deepEqual([...byUnit.get("AAA3000")!], ["AAA2000"])
})

test("waiversByUnit reads a plan saved before waivers existed", () => {
  assert.equal(waiversByUnit({}).size, 0)
})

test("withWaived adds to the completed codes without changing them", () => {
  const completed = new Set(["AAA1000"])

  assert.deepEqual(
    [...withWaived(completed, new Set(["AAA1001"]))],
    ["AAA1000", "AAA1001"]
  )
  assert.deepEqual([...completed], ["AAA1000"])
  assert.equal(withWaived(completed, undefined), completed)
})

test("placedWaivers leaves out a unit no longer on the plan", () => {
  const placed = { unitCode: "AAA3000", prerequisiteCode: "AAA1000" }
  const removed = { unitCode: "AAA3001", prerequisiteCode: "AAA1000" }

  assert.deepEqual(
    placedWaivers(
      planState([{ S1: ["AAA3000"] }], { waivers: [placed, removed] })
    ),
    [placed]
  )
})
