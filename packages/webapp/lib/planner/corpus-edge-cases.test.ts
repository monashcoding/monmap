/**
 * Edge cases found by the all-years corpus audit
 * (`docs/data-gaps-audit-2026-08.md`).
 *
 * These pin *code behaviour* at the boundaries the real data reaches.
 * The data counts themselves live in the corpus baseline
 * (`pnpm --filter webapp verify:corpus`), because they change with
 * every re-ingest and belong in a harness, not an assertion.
 *
 * Several tests below pin behaviour that is arguably wrong. They are
 * written as documentation with the reason stated, so that changing
 * the behaviour is a deliberate act that shows up as a failing test
 * rather than a silent shift.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import {
  ADDABLE_SLOT_KINDS,
  classifyTeachingPeriod,
} from "./teaching-period.ts"
import { summarizePlan } from "./progress.ts"
import { keyFor, validatePlan } from "./validation.ts"
import {
  offeringMap,
  planState,
  prereq,
  prereqAny,
  unitMap,
} from "./test-fixtures.ts"
import type { PeriodKind, PlannerCourseWithAoS } from "./types.ts"

const state = () => planState([{ S1: [], S2: [] }], { courseCode: "B2057" })

const course = (creditPoints: number): PlannerCourseWithAoS => ({
  year: "2026",
  code: "B2057",
  title: "Bachelor of Digital Business",
  creditPoints,
  aqfLevel: null,
  type: null,
  areasOfStudy: [],
  courseUnits: [],
  courseRequirements: [],
  componentCourses: [],
})

/* ------------------------------------------------------------------ *
 * Units offered only in unmodelled periods have nowhere to go.
 *
 * 586 of 2026's units are offered *only* in periods that classify as
 * OTHER (research quarters, trimesters, terms, Monash Indonesia), and
 * 76 of those are named by an area-of-study unit list. No named
 * teaching period holds them: OTHER slots exist only as the freeform
 * "Untitled" sections a student creates, which carry no period.
 * ------------------------------------------------------------------ */

test("no named period kind holds OTHER — only an Untitled slot can", () => {
  const addable: readonly PeriodKind[] = ADDABLE_SLOT_KINDS
  assert.ok(
    !addable.includes("OTHER"),
    "if OTHER becomes a named period this gap is closed — update the audit"
  )
  // The real periods that land there, straight from the 2026 corpus.
  for (const p of [
    "Research quarter 1",
    "Trimester 2",
    "Teaching period 5",
    "Term 3",
    "Monash Indonesia term 1",
  ]) {
    const kind = classifyTeachingPeriod(p)
    assert.equal(kind, "OTHER", p)
    assert.ok(!addable.includes(kind), `${p} has no slot to sit in`)
  }
})

test("FULL_YEAR is also not directly addable — it is reached via twins, not a slot", () => {
  assert.ok(!ADDABLE_SLOT_KINDS.includes("FULL_YEAR"))
  assert.equal(classifyTeachingPeriod("Full year"), "FULL_YEAR")
  assert.equal(classifyTeachingPeriod("Full year extended"), "FULL_YEAR")
})

/* ------------------------------------------------------------------ *
 * Course credit points can be null in the corpus.
 *
 * B2057 (Bachelor of Digital Business) and B0601 (Diploma of
 * Business) carry null credit_points in 2026. `summarizePlan` falls
 * back to 144, so the progress ring adopts a denominator nobody
 * verified for these courses.
 * ------------------------------------------------------------------ */

test("a course with real credit points uses them as the target", () => {
  assert.equal(
    summarizePlan(state(), course(240), new Map()).targetCreditPoints,
    240
  )
})

test("null course credit points silently fall back to 144", () => {
  // Documents summarizePlan's targetCreditPoints fallback. If this ever becomes an
  // explicit "unknown" instead of a guess, this test should change.
  const nullCp = { ...course(0), creditPoints: null as unknown as number }
  assert.equal(
    summarizePlan(state(), nullCp, new Map()).targetCreditPoints,
    144
  )
})

test("no course at all also yields the 144 default", () => {
  assert.equal(summarizePlan(state(), null, new Map()).targetCreditPoints, 144)
})

test("a zero-credit-point course does NOT fall back — 0 is a real value to ??", () => {
  // ?? only catches null/undefined, so 0 passes through. The ring
  // guards `> 0` (the right sidebar's progress ring) rather than dividing by zero.
  assert.equal(
    summarizePlan(state(), course(0), new Map()).targetCreditPoints,
    0
  )
})

/* ------------------------------------------------------------------ *
 * Prerequisites naming a unit that doesn't exist in the year.
 *
 * 1,215 of 2026's 8,288 requisite refs name a unit absent that year,
 * and 141 of the 159 missing prerequisite codes exist in *another*
 * year — they are discontinued units the handbook still names. Only 2
 * template units end up with no satisfiable code at all, so the logic
 * is sound; what the audit flagged is that the message names a unit
 * the student cannot look up, with no hint it is discontinued.
 * ------------------------------------------------------------------ */

test("a prereq naming a unit absent from the year stays unsatisfied, and names it", () => {
  const s = planState([{ S1: ["MTE4592"] }])
  const unitsByCode = unitMap(["MTE4592"])
  const offeringsByCode = offeringMap({ MTE4592: ["S1"] })
  // ETW2001 is one of the real discontinued codes 2026 still references.
  const requisitesByCode = new Map([["MTE4592", [prereq("ETW2001")]]])

  const out = validatePlan(s, unitsByCode, offeringsByCode, requisitesByCode)
  const card = out.get(keyFor(0, 0, "MTE4592"))
  assert.ok(card)
  const unmet = card.errors.find((e) => e.kind === "prereq_unmet")
  assert.ok(unmet, "an absent prereq code must not silently pass")
  assert.deepEqual(unmet.relatedCodes, ["ETW2001"])
  // Documents today's wording: the student is told to take a unit that
  // has no row in their year. If a "discontinued" hint is added, this
  // assertion should change.
  assert.match(unmet.message, /ETW2001/)
})

test("an OR branch keeps the unit satisfiable even when one code is absent", () => {
  // Why only 2 of the 300 units with a dangling prereq code are truly
  // stuck: the rest offer an alternative that does exist.
  const s = planState([{ S1: ["FIT1045"], S2: ["FIT2004"] }])
  const unitsByCode = unitMap(["FIT1045", "FIT2004"])
  const offeringsByCode = offeringMap({ FIT1045: ["S1"], FIT2004: ["S2"] })
  const requisitesByCode = new Map([
    ["FIT2004", [prereqAny("ACX1100", "FIT1045")]],
  ])

  const out = validatePlan(s, unitsByCode, offeringsByCode, requisitesByCode)
  const card = out.get(keyFor(0, 1, "FIT2004"))
  assert.ok(card)
  assert.equal(card.errors.length, 0, "the surviving OR branch satisfies it")
})
