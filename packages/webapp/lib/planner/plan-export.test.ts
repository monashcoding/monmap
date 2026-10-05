import { test } from "node:test"
import assert from "node:assert/strict"

import { buildCsv, planFileName } from "./plan-export.ts"
import { summarizePlan } from "./progress.ts"
import { defaultState, plannerReducer } from "./state.ts"
import { offeringMap, unitMap } from "./test-fixtures.ts"

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
  assert.deepEqual(rows[1], [
    "Semester 1, 2027",
    "FIT1045 Introduction to programming (HD 85)",
    "",
    "",
    "",
    "6",
  ])
  assert.deepEqual(rows.at(-1), ["Total", "", "", "", "", "6"])
})

test("the CSV total matches the progress ring", () => {
  // A 12 CP full-year unit in S1 and S2, a retake in Year 2 and a
  // credit entry recorded twice. Each counts once in the total.
  let st = defaultState("2027", "C2001", 2)
  st = plannerReducer(st, {
    type: "add_full_year_unit",
    yearIndex: 0,
    code: "FY1000",
    fullYearCodes: [],
  })
  for (const [yearIndex, slotIndex] of [
    [0, 0],
    [1, 0],
  ])
    st = plannerReducer(st, {
      type: "add_unit",
      yearIndex,
      slotIndex,
      code: "FIT1045",
    })
  st = {
    ...st,
    credit: [
      { code: "MAT1830", creditPoints: 6 },
      { code: "MAT1830", creditPoints: 6 },
    ],
  }
  const units = new Map([
    ...unitMap(["FIT1045", "MAT1830"]),
    ...unitMap(["FY1000"], { creditPoints: 12 }),
  ])
  const offerings = offeringMap({ FY1000: ["FULL_YEAR"], FIT1045: ["S1"] })

  const rows = parse(buildCsv(st, { units, offerings, grades: new Map() }))
  const cp = (label: string) =>
    rows.filter((r) => r[0] === label).map((r) => r.at(-1))

  // Rows show workload: half the FY unit in each semester, the retake
  // in its own row.
  assert.deepEqual(cp("Semester 1, 2027"), ["12"])
  assert.deepEqual(cp("Semester 2, 2027"), ["6"])
  assert.deepEqual(cp("Semester 1, 2028"), ["6"])
  // The total counts FY1000 once, FIT1045 once and MAT1830 once.
  assert.deepEqual(cp("Total"), ["24"])
  assert.equal(summarizePlan(st, null, units, offerings).totalCreditPoints, 24)
})

test("plan file names stay readable", () => {
  assert.equal(
    planFileName("Jason's course map", "csv"),
    "Jason's course map.csv"
  )
  assert.equal(planFileName("a/b: c?", "csv"), "ab c.csv")
  assert.equal(planFileName("  ", "csv"), "MonMap plan.csv")
})
