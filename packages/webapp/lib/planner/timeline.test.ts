import { test } from "node:test"
import assert from "node:assert/strict"

import {
  slotCalendarYear,
  slotLabel,
  sortSlots,
  studyYearSpan,
} from "./timeline.ts"

const s1 = { courseYear: "2027" }
const s2 = { courseYear: "2027", startPeriod: "S2" as const }

test("a Semester 1 start keeps each study year in one calendar year", () => {
  assert.equal(slotCalendarYear(s1, 0, "S1"), 2027)
  assert.equal(slotCalendarYear(s1, 0, "WINTER"), 2027)
  assert.equal(slotCalendarYear(s1, 0, "S2"), 2027)
  // The summer after S2 runs in January of the next year.
  assert.equal(slotCalendarYear(s1, 0, "SUMMER_A"), 2028)
  assert.equal(studyYearSpan(s1, 2), "2029")
})

test("a mid-year start spans two calendar years", () => {
  assert.equal(slotCalendarYear(s2, 0, "S2"), 2027)
  assert.equal(slotCalendarYear(s2, 0, "SUMMER_A"), 2028)
  assert.equal(slotCalendarYear(s2, 0, "S1"), 2028)
  assert.equal(slotCalendarYear(s2, 1, "S2"), 2028)
  assert.equal(studyYearSpan(s2, 0), "2027–28")
  assert.equal(slotLabel(s2, 0, { kind: "S1" }), "Semester 1, 2028")
})

test("slots sort chronologically for the intake", () => {
  const kinds = (xs: { kind: string }[]) => xs.map((x) => x.kind)
  const mixed = [
    { kind: "S1" as const },
    { kind: "S2" as const },
    { kind: "SUMMER_B" as const },
    { kind: "WINTER" as const },
    { kind: "OTHER" as const },
  ]
  assert.deepEqual(kinds(sortSlots(mixed, "S1")), [
    "S1",
    "WINTER",
    "S2",
    "SUMMER_B",
    "OTHER",
  ])
  assert.deepEqual(kinds(sortSlots(mixed, "S2")), [
    "S2",
    "SUMMER_B",
    "S1",
    "WINTER",
    "OTHER",
  ])
})

test("a custom slot label wins", () => {
  assert.equal(
    slotLabel(s1, 0, { kind: "OTHER", label: "Exchange" }),
    "Exchange"
  )
})

import { defaultState, normalizeTimeline, plannerReducer } from "./state.ts"
import type { PlannerState } from "./types.ts"

test("switching to a mid-year intake reorders semesters and keeps units", () => {
  let st = defaultState("2027", "C2001", 2)
  st = plannerReducer(st, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  st = plannerReducer(st, { type: "set_start_period", period: "S2" })
  assert.equal(st.startPeriod, "S2")
  assert.deepEqual(
    st.years[0]!.slots.map((s) => s.kind),
    ["S2", "S1"]
  )
  assert.deepEqual(st.years[0]!.slots[1]!.unitCodes, ["FIT1045"])
  // Back to S1 clears the field rather than storing the default.
  st = plannerReducer(st, { type: "set_start_period", period: "S1" })
  assert.equal(st.startPeriod, undefined)
  assert.deepEqual(
    st.years[0]!.slots.map((s) => s.kind),
    ["S1", "S2"]
  )
})

test("new years and optional periods follow the intake", () => {
  let st: PlannerState = { ...defaultState("2027", null, 1), startPeriod: "S2" }
  st = plannerReducer(st, { type: "add_year" })
  assert.deepEqual(
    st.years[1]!.slots.map((s) => s.kind),
    ["S2", "S1"]
  )
  st = plannerReducer(st, { type: "add_year", only: "first" })
  assert.deepEqual(
    st.years[2]!.slots.map((s) => s.kind),
    ["S2"]
  )
  st = plannerReducer(st, {
    type: "add_optional_slot",
    yearIndex: 0,
    kind: "SUMMER_A",
  })
  assert.deepEqual(
    st.years[0]!.slots.map((s) => s.kind),
    ["S2", "SUMMER_A", "S1"]
  )
})

test("leave clears a semester and the other half of its full-year units", () => {
  let st = defaultState("2027", null, 1)
  st = plannerReducer(st, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FY1",
  })
  st = plannerReducer(st, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 1,
    code: "FY1",
  })
  st = plannerReducer(st, {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 1,
    code: "FIT2004",
  })
  st = plannerReducer(st, {
    type: "set_slot_status",
    yearIndex: 0,
    slotIndex: 0,
    status: "leave",
  })
  assert.equal(st.years[0]!.slots[0]!.status, "leave")
  assert.deepEqual(st.years[0]!.slots[0]!.unitCodes, [])
  assert.deepEqual(st.years[0]!.slots[1]!.unitCodes, ["FIT2004"])
})

test("exchange periods carry a credit block", () => {
  let st = defaultState("2027", null, 1)
  st = plannerReducer(st, {
    type: "set_slot_status",
    yearIndex: 0,
    slotIndex: 1,
    status: "exchange",
  })
  assert.equal(st.years[0]!.slots[1]!.creditPoints, 24)
  st = plannerReducer(st, {
    type: "set_slot_credit",
    yearIndex: 0,
    slotIndex: 1,
    creditPoints: 18,
  })
  assert.equal(st.years[0]!.slots[1]!.creditPoints, 18)
  st = plannerReducer(st, {
    type: "set_slot_status",
    yearIndex: 0,
    slotIndex: 1,
    status: null,
  })
  assert.equal(st.years[0]!.slots[1]!.status, undefined)
  assert.equal(st.years[0]!.slots[1]!.creditPoints, undefined)
})

test("old plans with Winter after Semester 2 are put in time order", () => {
  const st = defaultState("2027", null, 1)
  st.years[0]!.slots.push({ kind: "WINTER", unitCodes: [] })
  const fixed = normalizeTimeline(st)
  assert.deepEqual(
    fixed.years[0]!.slots.map((s) => s.kind),
    ["S1", "WINTER", "S2"]
  )
  assert.equal(normalizeTimeline(fixed), fixed)
})

import { nextSemesters } from "./timeline.ts"

test("next semesters continue from the end of the plan", () => {
  const full = defaultState("2027", null, 2)
  assert.deepEqual(nextSemesters(full, 3), [
    { yearIndex: 2, kind: "S1" },
    { yearIndex: 2, kind: "S2" },
    { yearIndex: 3, kind: "S1" },
  ])
  const half = plannerReducer(full, { type: "add_year", only: "first" })
  assert.deepEqual(nextSemesters(half, 2), [
    { yearIndex: 2, kind: "S2" },
    { yearIndex: 3, kind: "S1" },
  ])
  const mid: PlannerState = {
    ...defaultState("2027", null, 1),
    startPeriod: "S2",
  }
  assert.deepEqual(nextSemesters(mid, 2), [
    { yearIndex: 1, kind: "S2" },
    { yearIndex: 1, kind: "S1" },
  ])
})

import { isFreshPlan, yearsNeeded } from "./timeline.ts"

test("years needed assume a full load", () => {
  assert.equal(yearsNeeded(144), 3)
  assert.equal(yearsNeeded(192), 4)
  assert.equal(yearsNeeded(null), 3)
})

test("shrinking the year count keeps years that are in use", () => {
  let st = defaultState("2027", null, 4)
  st = plannerReducer(st, {
    type: "add_unit",
    yearIndex: 2,
    slotIndex: 0,
    code: "FIT3171",
  })
  st = plannerReducer(st, { type: "set_year_count", count: 1 })
  assert.equal(st.years.length, 3)
})

test("a plan is fresh until it has content or setup is done", () => {
  let st = defaultState("2027", "C2001", 3)
  assert.equal(isFreshPlan(st), true)
  st = plannerReducer(st, { type: "complete_setup" })
  assert.equal(isFreshPlan(st), false)
  const withUnit = plannerReducer(defaultState("2027", null, 1), {
    type: "add_unit",
    yearIndex: 0,
    slotIndex: 0,
    code: "FIT1045",
  })
  assert.equal(isFreshPlan(withUnit), false)
})
