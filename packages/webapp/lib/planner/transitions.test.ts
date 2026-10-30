import { test } from "node:test"
import assert from "node:assert/strict"

import {
  adviceSentence,
  afterLastOffering,
  beforeFirstOffering,
  buildTransitions,
  statedPeriods,
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
    { code: "FIT2119", firstOffered: { year: 2028 }, periods: ["S1", "S2"] },
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

test("buildTransitions: a code in two sources is an error", () => {
  const other = { name: "Faculty of Science", units: [SOURCE.units[0]] }
  assert.throws(() => buildTransitions([SOURCE, other]), /FIT1008/)
})

test("afterLastOffering: a final S1 offering rules out S2 of that year", () => {
  const last = { year: 2027, period: "S1" } as const
  assert.equal(afterLastOffering(last, "S1", 2027), false)
  assert.equal(afterLastOffering(last, "WINTER", 2027), true)
  assert.equal(afterLastOffering(last, "S2", 2027), true)
  assert.equal(afterLastOffering(last, "SUMMER_A", 2027), false)
  assert.equal(afterLastOffering(last, "SUMMER_A", 2028), true)
})

test("afterLastOffering: a final full-year offering runs to the end of S2", () => {
  const last = { year: 2027, period: "FULL_YEAR" } as const
  assert.equal(afterLastOffering(last, "S2", 2027), false)
  assert.equal(afterLastOffering(last, "S1", 2028), true)
})

test("afterLastOffering: 'no longer offered' is every year after", () => {
  const last = { year: 2026 }
  assert.equal(afterLastOffering(last, "S2", 2026), false)
  assert.equal(afterLastOffering(last, "S1", 2027), true)
  assert.equal(afterLastOffering(last, "OTHER", 2027), true)
})

test("beforeFirstOffering: a unit first run in S2 isn't there in S1", () => {
  const first = { year: 2027, period: "S2" } as const
  assert.equal(beforeFirstOffering(first, "S1", 2027), true)
  assert.equal(beforeFirstOffering(first, "S2", 2027), false)
  assert.equal(beforeFirstOffering(first, "OTHER", 2027), false)
  assert.equal(beforeFirstOffering({ year: 2028 }, "S2", 2027), true)
  assert.equal(beforeFirstOffering({ year: 2028 }, "S1", 2028), false)
})

test("statedPeriods: a new unit's periods, or none", () => {
  const transitions = buildTransitions([SOURCE])
  assert.deepEqual(statedPeriods("FIT2119", transitions), ["S1", "S2"])
  assert.deepEqual(statedPeriods("FIT1008", transitions), [])
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
