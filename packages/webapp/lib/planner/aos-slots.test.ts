import { test } from "node:test"
import assert from "node:assert/strict"

import {
  MAX_PICKS_PER_SLOT,
  computeAosSlots,
  computeAosSlotsWithRepeats,
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

/* ------------------------------------------------------------------ *
 * Repeat slots — multiple majors/minors.
 * docs/plan-multiple-aos.md §1, §2.
 * ------------------------------------------------------------------ */

function repeatCourse(
  kind: PlannerAreaOfStudy["kind"],
  codes: string[]
): PlannerCourseWithAoS {
  return {
    year: "2026",
    code: "A2000",
    title: "Arts",
    creditPoints: 144,
    aqfLevel: null,
    type: null,
    overview: null,
    areasOfStudy: codes.map((c) => ({
      code: c,
      title: c,
      kind,
      relationshipLabel: "Arts majors",
      creditPoints: null,
      units: [],
      requiredUnits: [],
      requirements: [],
    })),
    courseUnits: [],
    courseRequirements: [],
    componentCourses: [],
  }
}

test("no repeat slot until the base slot is filled", () => {
  const c = repeatCourse("major", ["M1", "M2", "M3"])
  const keys = computeAosSlotsWithRepeats(c, {}).map((s) => s.key)
  assert.deepEqual(keys, ["major"])
})

test("filling the base slot earns exactly one repeat slot", () => {
  const c = repeatCourse("major", ["M1", "M2", "M3"])
  const slots = computeAosSlotsWithRepeats(c, { major: "M1" })
  assert.deepEqual(
    slots.map((s) => s.key),
    ["major", "major#2"]
  )
  // …and the cap holds once the second is used.
  assert.deepEqual(
    computeAosSlotsWithRepeats(c, { major: "M1", "major#2": "M2" }).map(
      (s) => s.key
    ),
    ["major", "major#2"]
  )
})

test("sibling picks are excluded — the same major can't be taken twice", () => {
  const c = repeatCourse("major", ["M1", "M2", "M3"])
  const slots = computeAosSlotsWithRepeats(c, { major: "M1" })
  const repeat = slots.find((s) => s.key === "major#2")!
  assert.deepEqual(
    repeat.options.map((o) => o.code),
    ["M2", "M3"]
  )
  assert.equal(
    computeAosSlotsWithRepeats(c, { major: "M1", "major#2": "M2" }).find(
      (s) => s.key === "major#3"
    ),
    undefined,
    "capped at two"
  )
})

test("the cap stops at MAX_PICKS_PER_SLOT, which the corpus puts at 2", () => {
  // "second major"/"double major" appears in 9-29 courses every year;
  // "third major"/"three majors" appears in none, in any year.
  const c = repeatCourse("major", ["M1", "M2", "M3", "M4", "M5"])
  assert.equal(MAX_PICKS_PER_SLOT, 2)
  const slots = computeAosSlotsWithRepeats(c, { major: "M1", "major#2": "M2" })
  assert.deepEqual(
    slots.map((s) => s.key),
    ["major", "major#2"],
    "no third slot even with options left"
  )
})

test("no empty repeat slot when the options run out", () => {
  const c = repeatCourse("major", ["M1", "M2"])
  const slots = computeAosSlotsWithRepeats(c, { major: "M1", "major#2": "M2" })
  assert.deepEqual(
    slots.map((s) => s.key),
    ["major", "major#2"]
  )
})

test("minors and extended majors repeat; specialisations never do", () => {
  for (const kind of ["minor", "extended_major"] as const) {
    const c = repeatCourse(kind, ["X1", "X2"])
    const base = computeAosSlotsWithRepeats(c, {})[0]!
    const withPick = computeAosSlotsWithRepeats(c, { [base.key]: "X1" })
    assert.equal(withPick.length, 2, kind)
  }
  const spec = repeatCourse("specialisation", ["S1", "S2"])
  const base = computeAosSlotsWithRepeats(spec, {})[0]!
  assert.deepEqual(
    computeAosSlotsWithRepeats(spec, { [base.key]: "S1" }).map((s) => s.key),
    [base.key]
  )
})

test("a legacy fixed-role value never serves a repeat slot", () => {
  // "major" already holds it; if legacyKeys leaked through, the same
  // pick would render in both dropdowns.
  const c = repeatCourse("major", ["M1", "M2"])
  const repeat = computeAosSlotsWithRepeats(c, { major: "M1" }).find(
    (s) => s.key === "major#2"
  )!
  assert.deepEqual(repeat.legacyKeys, [])
  assert.equal(resolveSlotSelection({ major: "M1" }, repeat), undefined)
})

test("REGRESSION: a saved plan's primary pick keeps its original key", () => {
  // The whole reason for "#2" suffixes over widening selectedAos to
  // arrays — plans saved before this feature must not migrate.
  const c = repeatCourse("major", ["M1", "M2"])
  const slots = computeAosSlotsWithRepeats(c, { major: "M1" })
  assert.equal(slots[0]!.key, "major")
  assert.equal(resolveSlotSelection({ major: "M1" }, slots[0]!), "M1")
})

test("repeat picks surface in pickedAosEntries", () => {
  const c = repeatCourse("major", ["M1", "M2"])
  const picked = pickedAosEntries(c, { major: "M1", "major#2": "M2" })
  assert.deepEqual(
    picked.map((p) => p.aos.code),
    ["M1", "M2"]
  )
  assert.deepEqual(
    picked.map((p) => p.slotKey),
    ["major", "major#2"]
  )
})

test("a 60-option slot (2020 S2006 minors) repeats without losing options", () => {
  const codes = Array.from({ length: 60 }, (_, i) => `MN${i + 1}`)
  const c = repeatCourse("minor", codes)
  const base = computeAosSlotsWithRepeats(c, {})[0]!
  assert.equal(base.options.length, 60)
  const slots = computeAosSlotsWithRepeats(c, { [base.key]: "MN1" })
  const repeat = slots.find((s) => s.key === `${base.key}#2`)!
  assert.equal(repeat.options.length, 59)
  assert.ok(!repeat.options.some((o) => o.code === "MN1"))
})

test("clearing a base pick strands nothing: higher slots stop being offered", () => {
  // Pairs with higherRepeatKeys() in aos-picker.tsx, which clears them
  // from state. Without that, "major#3" would sit in selectedAos
  // invisible behind an empty "major#2".
  const c = repeatCourse("major", ["M1", "M2", "M3"])
  const full = { major: "M1", "major#2": "M2" }
  assert.equal(computeAosSlotsWithRepeats(c, full).length, 2)

  const cleared = { ...full, major: undefined }
  const keys = computeAosSlotsWithRepeats(c, cleared).map((s) => s.key)
  assert.deepEqual(keys, ["major"], "no repeat slots survive an empty base")
})
