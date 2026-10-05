import { test } from "node:test"
import assert from "node:assert/strict"

import {
  cleanCodes,
  cleanCodesByYear,
  cleanGradeCode,
  cleanMark,
  cleanPlanName,
  cleanQuery,
  cleanTreeControls,
  cleanYear,
  isPlannerState,
  MAX_HYDRATE_CODES,
  MAX_PLAN_STATE_CHARS,
} from "./input.ts"
import { containsPattern, likeEscape } from "./like.ts"

const YEARS = ["2025", "2026", "2027"]

test("cleanYear accepts only handbook years in the database", () => {
  assert.equal(cleanYear("2026", YEARS), "2026")
  assert.equal(cleanYear("2019", YEARS), null)
  assert.equal(cleanYear(2026, YEARS), null)
  assert.equal(cleanYear("2026 ", YEARS), null)
})

test("cleanCodes drops junk, dedupes, sorts and caps", () => {
  assert.deepEqual(
    cleanCodes([
      "FIT2004",
      "FIT1045",
      "FIT2004",
      5,
      "fit1008",
      "x",
      "A".repeat(25),
    ]),
    ["FIT1045", "FIT2004"]
  )
  assert.deepEqual(cleanCodes("FIT1045"), [])
  assert.deepEqual(cleanCodes(["C", "B", "A2", "A1"], 2), ["A1", "A2"])
})

test("a course-sized hydrate (813 codes, E3002) is not truncated", () => {
  const codes = Array.from({ length: 813 }, (_, i) => `ENG${1000 + i}`)
  assert.equal(cleanCodes(codes).length, 813)
  assert.equal(
    cleanCodes(Array.from({ length: 5000 }, (_, i) => `U${i}X`)).length,
    MAX_HYDRATE_CODES
  )
})

test("cleanCodesByYear keeps known years and caps the total", () => {
  const out = cleanCodesByYear(
    { "2026": ["FIT1045", "bad"], "1999": ["FIT1008"], "2027": ["FIT2004"] },
    YEARS
  )
  assert.deepEqual(Object.fromEntries(out), {
    "2026": ["FIT1045"],
    "2027": ["FIT2004"],
  })
  const capped = cleanCodesByYear(
    { "2026": ["AA11", "AA12"], "2027": ["AA13", "AA14"] },
    YEARS,
    3
  )
  assert.deepEqual(Object.fromEntries(capped), {
    "2026": ["AA11", "AA12"],
    "2027": ["AA13"],
  })
  assert.equal(cleanCodesByYear(null, YEARS).size, 0)
  assert.equal(cleanCodesByYear(["2026"], YEARS).size, 0)
})

test("cleanQuery trims and cuts search text", () => {
  assert.equal(cleanQuery("  fit  "), "fit")
  assert.equal(cleanQuery("x".repeat(500)).length, 100)
  assert.equal(cleanQuery(42), "")
  assert.equal(cleanQuery(null), "")
})

test("plan names, marks and grade codes", () => {
  assert.equal(cleanPlanName("  My plan "), "My plan")
  assert.equal(cleanPlanName("x".repeat(200))?.length, 80)
  assert.equal(cleanPlanName("   "), null)
  assert.equal(cleanPlanName(42), null)
  assert.equal(cleanMark(84.6), 85)
  assert.equal(cleanMark(0), 0)
  assert.equal(cleanMark(100), 100)
  for (const bad of [NaN, -1, 101, Infinity, "80", null]) {
    assert.equal(cleanMark(bad), null)
  }
  assert.equal(cleanGradeCode(" fit1045 "), "FIT1045")
  assert.equal(cleanGradeCode("<script>"), null)
  assert.equal(cleanGradeCode(12), null)
})

test("cleanTreeControls accepts real controls and rejects junk", () => {
  const ok = {
    mode: "course",
    courseCode: "C2001",
    aosCode: "C2001:part-d-applied-studies:software",
    unitCode: null,
    direction: "upstream",
    year: "2026",
  }
  assert.deepEqual(cleanTreeControls(ok, YEARS), ok)
  assert.equal(cleanTreeControls({ ...ok, mode: "x" }, YEARS), null)
  assert.equal(cleanTreeControls({ ...ok, direction: "sideways" }, YEARS), null)
  assert.equal(cleanTreeControls({ ...ok, year: "1999" }, YEARS), null)
  assert.equal(cleanTreeControls(null, YEARS), null)
  assert.equal(
    cleanTreeControls({ ...ok, courseCode: "c2001; drop" }, YEARS)?.courseCode,
    null
  )
  assert.equal(
    cleanTreeControls({ ...ok, aosCode: "x".repeat(500) }, YEARS)?.aosCode,
    null
  )
})

function plan(extra: Record<string, unknown> = {}) {
  return {
    courseYear: "2026",
    courseCode: "C2001",
    selectedAos: { major: "SFTWRDEV08", minor: undefined },
    years: [
      {
        label: "Year 1",
        slots: [
          { kind: "S1", unitCodes: ["FIT1045", "FIT1047"] },
          { kind: "S2", unitCodes: [], capacity: 3, status: "leave" },
        ],
      },
    ],
    credit: [{ code: null, creditPoints: 24, label: "Deakin" }],
    startPeriod: "S1",
    setupDone: true,
    campus: "Clayton",
    ...extra,
  }
}

test("isPlannerState accepts real plans", () => {
  assert.equal(isPlannerState(plan()), true)
  assert.equal(
    isPlannerState(plan({ credit: undefined, campus: undefined })),
    true
  )
  // Early plans hold booleans in selectedAos.
  assert.equal(isPlannerState(plan({ selectedAos: { major: true } })), true)
  // Unknown keys are kept, so a field added later is not refused.
  assert.equal(isPlannerState(plan({ somethingNew: 1 })), true)
})

test("isPlannerState rejects malformed plans", () => {
  assert.equal(isPlannerState(null), false)
  assert.equal(isPlannerState(plan({ courseYear: "x" })), false)
  assert.equal(isPlannerState(plan({ courseCode: 5 })), false)
  assert.equal(isPlannerState(plan({ selectedAos: null })), false)
  assert.equal(isPlannerState(plan({ selectedAos: { major: {} } })), false)
  assert.equal(isPlannerState(plan({ years: [1, "a"] })), false)
  assert.equal(isPlannerState(plan({ years: [{}] })), false)
  assert.equal(
    isPlannerState(
      plan({
        years: [{ label: "Y", slots: [{ kind: "LUNCH", unitCodes: [] }] }],
      })
    ),
    false
  )
  assert.equal(
    isPlannerState(
      plan({ years: [{ label: "Y", slots: [{ kind: "S1", unitCodes: [1] }] }] })
    ),
    false
  )
  assert.equal(
    isPlannerState(plan({ credit: [{ code: 1, creditPoints: 6 }] })),
    false
  )
  assert.equal(
    isPlannerState(
      plan({
        years: Array.from({ length: 31 }, () => ({ label: "Y", slots: [] })),
      })
    ),
    false
  )
})

test("isPlannerState rejects a state over the size cap", () => {
  const big = plan({ padding: "x".repeat(MAX_PLAN_STATE_CHARS) })
  assert.equal(isPlannerState(big), false)
})

test("LIKE wildcards are escaped", () => {
  assert.equal(likeEscape("50%_off"), "50\\%\\_off")
  assert.equal(likeEscape("a\\b"), "a\\\\b")
  assert.equal(likeEscape("FIT1045"), "FIT1045")
  assert.equal(containsPattern("%"), "%\\%%")
})
