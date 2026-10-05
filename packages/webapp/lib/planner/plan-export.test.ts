import { test } from "node:test"
import assert from "node:assert/strict"

import { buildCsv, planFileName } from "./plan-export.ts"
import { defaultState, plannerReducer } from "./state.ts"

function parse(csv: string): string[][] {
  assert.ok(csv.startsWith("﻿"))
  return csv
    .slice(1)
    .split("\r\n")
    .map((line) => line.slice(1, -1).split('","'))
}

test("the CSV lays a plan out like the planner", () => {
  let st = defaultState("2027", "C2001", 1)
  st = plannerReducer(st, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  const rows = parse(
    buildCsv(st, {
      units: new Map([
        ["FIT1045", { title: "Introduction to programming", creditPoints: 6 }],
      ]),
      grades: new Map([["FIT1045", 85]]),
    })
  )
  assert.deepEqual(rows[0], [
    "Teaching period",
    "Unit 1",
    "Unit 2",
    "Unit 3",
    "Unit 4",
    "Credit points",
  ])
  assert.equal(rows[1]![0], "First year (2027)")
  assert.deepEqual(rows[2], [
    "Semester 1, 2027",
    "FIT1045 Introduction to programming (HD 85)",
    "",
    "",
    "",
    "6",
  ])
  assert.deepEqual(rows.at(-1), ["Total", "", "", "", "", "6"])
})

test("plan file names stay readable", () => {
  assert.equal(
    planFileName("Jason's course map", "csv"),
    "Jason's course map.csv"
  )
  assert.equal(planFileName("a/b: c?", "csv"), "ab c.csv")
  assert.equal(planFileName("  ", "csv"), "MonMap plan.csv")
})
