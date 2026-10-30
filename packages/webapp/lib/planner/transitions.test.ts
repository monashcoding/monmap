import { test } from "node:test"
import assert from "node:assert/strict"

import {
  adviceSentence,
  afterLastOffering,
  beforeFirstOffering,
  buildTransitions,
  termLabel,
  type TransitionSource,
} from "./transitions.ts"
import { IT_2027 } from "./transitions-it-2027.ts"

const SOURCE: TransitionSource = {
  name: "Faculty of IT",
  units: [
    {
      code: "FIT1008",
      advice: "Replace with FIT2115",
      lastOffered: { year: 2026 },
      replacedBy: [["FIT2115"]],
    },
    {
      code: "MAT1841",
      lastOffered: { year: 2026 },
      replacedBy: [["MTH1020"], ["MTH1030"]],
    },
    {
      code: "FIT3144",
      lastOffered: { year: 2026 },
      replacedBy: [["FIT3230", "FIT3231"]],
    },
  ],
}

test("countsAs: a straight swap counts both ways", () => {
  const { countsAs } = buildTransitions([SOURCE])
  assert.deepEqual(countsAs.get("FIT1008"), ["FIT2115"])
  assert.deepEqual(countsAs.get("FIT2115"), ["FIT1008"])
})

test("countsAs: an either-or list only counts toward the old unit", () => {
  const { countsAs } = buildTransitions([SOURCE])
  assert.equal(countsAs.get("MAT1841"), undefined)
  assert.deepEqual(countsAs.get("MTH1020"), ["MAT1841"])
  assert.deepEqual(countsAs.get("MTH1030"), ["MAT1841"])
})

test("countsAs: part of a multi-unit replacement isn't the old unit", () => {
  const { countsAs } = buildTransitions([SOURCE])
  assert.deepEqual(countsAs.get("FIT3144"), ["FIT3230", "FIT3231"])
  assert.equal(countsAs.get("FIT3230"), undefined)
})

test("afterLastOffering: a final S1 offering rules out S2 of that year", () => {
  const t = { code: "X", lastOffered: { year: 2027, period: "S1" } } as const
  assert.equal(afterLastOffering(t, "S1", 2027), false)
  assert.equal(afterLastOffering(t, "WINTER", 2027), true)
  assert.equal(afterLastOffering(t, "S2", 2027), true)
  assert.equal(afterLastOffering(t, "SUMMER_A", 2027), false)
  assert.equal(afterLastOffering(t, "SUMMER_A", 2028), true)
})

test("afterLastOffering: a final full-year offering runs to the end of S2", () => {
  const t = {
    code: "X",
    lastOffered: { year: 2027, period: "FULL_YEAR" },
  } as const
  assert.equal(afterLastOffering(t, "S2", 2027), false)
  assert.equal(afterLastOffering(t, "S1", 2028), true)
})

test("afterLastOffering: 'no longer offered' is every year after", () => {
  const t = { code: "X", lastOffered: { year: 2026 } }
  assert.equal(afterLastOffering(t, "S2", 2026), false)
  assert.equal(afterLastOffering(t, "S1", 2027), true)
  assert.equal(afterLastOffering(t, "OTHER", 2027), true)
})

test("beforeFirstOffering: a unit first run in S2 isn't there in S1", () => {
  const t = { code: "X", firstOffered: { year: 2027, period: "S2" } } as const
  assert.equal(beforeFirstOffering(t, "S1", 2027), true)
  assert.equal(beforeFirstOffering(t, "S2", 2027), false)
  assert.equal(beforeFirstOffering(t, "OTHER", 2027), false)
  const fromYear = { code: "X", firstOffered: { year: 2028 } }
  assert.equal(beforeFirstOffering(fromYear, "S2", 2027), true)
  assert.equal(beforeFirstOffering(fromYear, "S1", 2028), false)
})

test("termLabel and adviceSentence read as the page does", () => {
  assert.equal(termLabel({ year: 2027, period: "S2" }), "Semester 2, 2027")
  assert.equal(termLabel({ year: 2028 }), "2028")
  const { byCode } = buildTransitions([SOURCE])
  assert.equal(
    adviceSentence(byCode.get("FIT1008")!),
    "Faculty of IT advice: Replace with FIT2115."
  )
  assert.equal(adviceSentence(byCode.get("MAT1841")!), null)
})

test("IT 2027: one entry per code, and no unit replaces itself", () => {
  const codes = IT_2027.units.map((u) => u.code)
  assert.equal(new Set(codes).size, codes.length)
  for (const u of IT_2027.units) {
    assert.match(u.code, /^[A-Z]{3}\d{4}$/)
    for (const way of u.replacedBy ?? []) {
      assert.ok(way.length > 0, u.code)
      for (const c of way) {
        assert.match(c, /^[A-Z]{3}\d{4}$/)
        assert.notEqual(c, u.code)
      }
    }
  }
})
