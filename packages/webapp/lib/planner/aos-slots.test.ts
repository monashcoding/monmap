import { test } from "node:test"
import assert from "node:assert/strict"

import {
  computeAosSlots,
  legacyKeyServing,
  pickedAosEntries,
  resolveSlotSelection,
} from "./aos-slots.ts"
import type { PlannerAreaOfStudy, PlannerCourseWithAoS } from "./types.ts"

const aos = (
  code: string,
  kind: PlannerAreaOfStudy["kind"],
  extra: Partial<PlannerAreaOfStudy> = {}
): PlannerAreaOfStudy => ({
  code,
  title: code,
  kind,
  relationshipLabel: "Part X",
  creditPoints: 48,
  units: [],
  requiredUnits: [],
  requirements: [],
  ...extra,
})

const courseWith = (areas: PlannerAreaOfStudy[]): PlannerCourseWithAoS => ({
  year: "2026",
  code: "TEST",
  title: "Test course",
  creditPoints: 192,
  aqfLevel: null,
  type: null,
  overview: null,
  areasOfStudy: areas,
  courseUnits: [],
  courseRequirements: [],
  componentCourses: [],
})

/** C2001-style single degree: two spec groups, one elective stream. */
const c2001 = courseWith([
  aos("ALGSFTWR01", "specialisation", {
    relationshipLabel: "Part C. Specialist studies",
    componentLabel: "Part C. Specialist studies",
  }),
  aos("ATINTELL02", "specialisation", {
    relationshipLabel: "Part C. Specialist studies",
    componentLabel: "Part C. Specialist studies",
  }),
  aos("C2001:part-d:algorithms", "specialisation", {
    relationshipLabel: "Part D. Applied studies",
  }),
  aos("MATHSTREAM", "elective", {
    relationshipLabel: "Part E. Free elective studies",
  }),
])

/** S2004-style double degree: everything is component-scoped. */
const s2004 = courseWith([
  aos("APPLMTH05", "major", {
    componentCourseCode: "S2000",
    componentLabel: "Science component",
  }),
  aos("BIOCHEM05", "major", {
    componentCourseCode: "S2000",
    componentLabel: "Science component",
  }),
  aos("CHEM01", "minor", {
    componentCourseCode: "S2000",
    componentLabel: "Science component",
  }),
  aos("ATINTELL02", "specialisation", {
    componentCourseCode: "C2001",
    componentLabel: "Computer Science component",
    relationshipLabel: "Part C. Specialist studies",
  }),
  aos("C2001:part-d:algorithms", "specialisation", {
    componentCourseCode: "C2001",
    componentLabel: "Computer Science component",
    relationshipLabel: "Part D. Applied studies",
  }),
  aos("GENSCI01", "specialisation", {
    componentCourseCode: "S2000",
    componentLabel: "Science component",
    relationshipLabel: "Part C. Science specialisation",
  }),
])

test("slots: single degree keeps the historical fixed-role keys", () => {
  const slots = computeAosSlots(c2001)
  assert.deepEqual(
    slots.map((s) => s.key),
    ["specialisation", "specialisation2", "elective"]
  )
  assert.deepEqual(
    slots.map((s) => s.label),
    [
      "Part C. Specialist studies specialisation",
      "Part D. Applied studies specialisation",
      "Elective stream",
    ]
  )
})

test("slots: double degree mints one slot per component (and per spec group)", () => {
  const slots = computeAosSlots(s2004)
  assert.deepEqual(
    slots.map((s) => s.key),
    [
      "major@S2000",
      "specialisation@C2001:part-c-specialist-studies",
      "specialisation@C2001:part-d-applied-studies",
      "specialisation@S2000:part-c-science-specialisation",
      "minor@S2000",
    ]
  )
  const cSpec = slots.find(
    (s) => s.key === "specialisation@C2001:part-c-specialist-studies"
  )!
  assert.equal(cSpec.label, "Computer Science: Part C. Specialist studies")
  const major = slots.find((s) => s.key === "major@S2000")!
  assert.equal(major.label, "Science major")
})

test("slots: a Part C spec AND a Part D studio are simultaneously selectable", () => {
  const slots = computeAosSlots(s2004)
  const selected = {
    "specialisation@C2001:part-c-specialist-studies": "ATINTELL02",
    "specialisation@C2001:part-d-applied-studies": "C2001:part-d:algorithms",
  }
  const values = slots
    .filter((s) => s.kind === "specialisation")
    .map((s) => resolveSlotSelection(selected, s))
  assert.deepEqual(values, ["ATINTELL02", "C2001:part-d:algorithms", undefined])
})

test("legacy fallback: a saved fixed-role pick serves the scoped slot whose options contain it", () => {
  const slots = computeAosSlots(s2004)
  const legacyState = { major: "BIOCHEM05", specialisation: "ATINTELL02" }
  const major = slots.find((s) => s.key === "major@S2000")!
  const cSpec = slots.find(
    (s) => s.key === "specialisation@C2001:part-c-specialist-studies"
  )!
  const sSpec = slots.find(
    (s) => s.key === "specialisation@S2000:part-c-science-specialisation"
  )!
  assert.equal(resolveSlotSelection(legacyState, major), "BIOCHEM05")
  assert.equal(resolveSlotSelection(legacyState, cSpec), "ATINTELL02")
  assert.equal(resolveSlotSelection(legacyState, sSpec), undefined)
  assert.equal(legacyKeyServing(legacyState, major), "major")
  assert.equal(legacyKeyServing(legacyState, cSpec), "specialisation")
})

test("legacy fallback: scoped key wins over a legacy value", () => {
  const slots = computeAosSlots(s2004)
  const major = slots.find((s) => s.key === "major@S2000")!
  const state = { major: "BIOCHEM05", "major@S2000": "APPLMTH05" }
  assert.equal(resolveSlotSelection(state, major), "APPLMTH05")
  assert.equal(legacyKeyServing(state, major), undefined)
})

test("pickedAosEntries: dedupes when legacy and scoped keys point at the same code", () => {
  const entries = pickedAosEntries(s2004, {
    major: "APPLMTH05",
    "major@S2000": "APPLMTH05",
  })
  assert.equal(entries.length, 1)
  assert.equal(entries[0]!.aos.code, "APPLMTH05")
  assert.equal(entries[0]!.label, "Major")
})

test("pickedAosEntries: stale keys from an older picker layout still surface", () => {
  const entries = pickedAosEntries(s2004, {
    "specialisation@C2001:renamed-label": "ATINTELL02",
  })
  assert.equal(entries.length, 1)
  assert.equal(entries[0]!.aos.code, "ATINTELL02")
  assert.equal(entries[0]!.label, "Specialisation")
})
