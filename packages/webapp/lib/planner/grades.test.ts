import { test } from "node:test"
import assert from "node:assert/strict"

import { computeGpa, computeWam, markToGrade } from "./grades.ts"

test("marks map to Monash grade bands", () => {
  assert.equal(markToGrade(80), "HD")
  assert.equal(markToGrade(79.9), "D")
  assert.equal(markToGrade(60), "C")
  assert.equal(markToGrade(50), "P")
  assert.equal(markToGrade(49), "N")
})

test("GPA matches Monash's worked example (minus the unmarked WN unit)", () => {
  // monash.edu GPA page example, without MON2002 (withdrawn fail, no
  // mark): 229.8 grade-value points over 72 credit points.
  const units = [
    { mark: 63, creditPoints: 6 },
    { mark: 80, creditPoints: 12 },
    { mark: 40, creditPoints: 6 },
    { mark: 85, creditPoints: 6 },
    { mark: 96, creditPoints: 24 },
    { mark: 52, creditPoints: 6 },
    { mark: 77, creditPoints: 6 },
    { mark: 82, creditPoints: 6 },
  ]
  assert.equal(computeGpa(units)?.toFixed(3), (229.8 / 72).toFixed(3))
})

test("WAM halves first-year units and keeps fails", () => {
  const wam = computeWam([
    { mark: 90, creditPoints: 6, level: "Level 1" },
    { mark: 60, creditPoints: 6, level: "Level 2" },
    { mark: 40, creditPoints: 6, level: "Level 3" },
  ])
  // (90·6·0.5 + 60·6 + 40·6) / (6·0.5 + 6 + 6) = 870 / 15
  assert.equal(wam, 58)
})

test("a missing level counts as a later year", () => {
  assert.equal(computeWam([{ mark: 70, creditPoints: 6, level: null }]), 70)
})

test("nothing graded gives null", () => {
  assert.equal(computeWam([]), null)
  assert.equal(computeGpa([]), null)
})
