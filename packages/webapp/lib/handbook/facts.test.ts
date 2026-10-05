import assert from "node:assert/strict"
import { test } from "node:test"

import type {
  AosPageData,
  CoursePageData,
  UnitPageData,
} from "../db/handbook.ts"
import {
  aosFacts,
  courseFacts,
  downstreamReach,
  isExam,
  qualification,
  uniqueBy,
  unitFacts,
} from "./facts.ts"
import type { RatingFacts } from "./summary.ts"

const NO_RATING: RatingFacts = {
  average: null,
  count: 0,
  axes: {},
  distribution: [0, 0, 0, 0, 0],
}

// Only the fields the facts read; the rest of the page data is noise.
function unit(over: Partial<UnitPageData>): UnitPageData {
  return {
    code: "FIT2004",
    title: "Algorithms and data structures",
    year: "2026",
    creditPoints: 6,
    level: "Level 2",
    undergradPostgrad: "Undergraduate",
    school: "Faculty of Information Technology",
    offerings: [],
    requisites: [],
    enrolmentRules: [],
    unlocks: [],
    areasOfStudy: [],
    assessments: [],
    workload: null,
    ...over,
  } as UnitPageData
}

const offering = (
  periodKind: string,
  location: string | null,
  attendanceModeCode = "ON-CAMPUS"
) =>
  ({
    teachingPeriod: periodKind,
    periodKind,
    location,
    attendanceMode: null,
    attendanceModeCode,
  }) as UnitPageData["offerings"][number]

const task = (
  name: string,
  weight: number | null,
  type: string | null = null
) => ({ name, weight, type }) as UnitPageData["assessments"][number]

test("workload reads the semester total from the handbook's prose", () => {
  const hours = (workload: string) =>
    unitFacts(unit({ workload }), NO_RATING, 0).workloadHours
  assert.equal(
    hours("<p>The total expected workload is 144 hours per semester.</p>"),
    144
  )
  assert.equal(hours("Plan for 150 hours across the teaching semester."), 150)
  assert.equal(hours("Allow a total of about 120 hours for this unit."), 120)
  // The per-semester figure wins over an earlier "total".
  assert.equal(
    hours("A total of 12 hours a week. In all, 144 hours per semester."),
    144
  )
  // A weekly breakdown alone is not summed.
  assert.equal(hours("3 hours per week of lectures and 2 hours of labs."), null)
  assert.equal(unitFacts(unit({}), NO_RATING, 0).workloadHours, null)
})

test("exam weight sums the exam tasks, and is null with no exam", () => {
  const weight = (assessments: UnitPageData["assessments"]) =>
    unitFacts(unit({ assessments }), NO_RATING, 0).examWeight
  assert.equal(
    weight([
      task("Final exam", 50),
      task("Mid-semester test", 10, "Examination"),
      task("Assignment", 40),
    ]),
    60
  )
  assert.equal(weight([task("Final exam", null)]), 0)
  assert.equal(weight([task("Assignment", 100)]), null)
  assert.ok(isExam({ name: "Quiz", type: "Exam (2 hours)" }))
  assert.ok(!isExam({ name: "Quiz", type: null }))
})

test("unit facts dedupe periods, drop OTHER, and keep one AoS per title", () => {
  const f = unitFacts(
    unit({
      offerings: [
        offering("S1", "Clayton"),
        offering("S1", "Malaysia"),
        offering("OTHER", "Clayton"),
        offering("S2", null, "ONLINE"),
      ],
      areasOfStudy: [
        { code: "SOFT-MAJ", title: "Software", grouping: "" },
        { code: "SOFT-MIN", title: "Software", grouping: "" },
        { code: "DATA-MAJ", title: "Data", grouping: "" },
      ],
    }),
    NO_RATING,
    7
  )
  assert.deepEqual(f.periods, ["Semester 1", "Semester 2"])
  assert.deepEqual(f.campuses, ["Clayton", "Malaysia"])
  assert.equal(f.online, true)
  assert.equal(f.level, 2)
  assert.equal(f.leadsTo, 7)
  assert.deepEqual(
    f.areasOfStudy.map((a) => a.code),
    ["SOFT-MAJ", "DATA-MAJ"]
  )
})

test("qualification is the first AQF part without its level", () => {
  assert.equal(
    qualification("Level 7 - Bachelor Degree / Level 8 - Honours"),
    "Bachelor Degree"
  )
  assert.equal(qualification("Level 9 - Doctoral Degree"), "Doctoral Degree")
  assert.equal(qualification(null), null)
})

test("course facts take the domestic ATAR and one entry per AoS code", () => {
  const f = courseFacts(
    {
      code: "C2001",
      title: "Bachelor of Computer Science",
      year: "2026",
      creditPoints: 144,
      fullTime: "3 Years",
      aqfLevel: "Level 7 - Bachelor Degree",
      school: null,
      modes: [],
      locations: "Clayton, Malaysia",
      atar: "70; International: 80",
      areasOfStudy: [
        { code: "A-MAJ", title: "A", kind: "major" },
        { code: "A-MAJ", title: "A", kind: "major" },
        { code: "B-MIN", title: "B", kind: "minor" },
      ],
    } as unknown as CoursePageData,
    NO_RATING
  )
  assert.equal(f.atar, "70")
  assert.equal(f.duration, "3 years")
  assert.deepEqual(f.campuses, ["Clayton", "Malaysia"])
  assert.deepEqual(
    f.aos.map((a) => a.code),
    ["A-MAJ", "B-MIN"]
  )
})

test("AoS facts list each course once", () => {
  const f = aosFacts(
    {
      code: "DASC-MAJ",
      title: "Data science",
      year: "2026",
      kind: "major",
      creditPoints: 48,
      unitCodes: ["FIT1043", "FIT2086"],
      locations: null,
      courses: [
        { code: "C2001", title: "CS", year: "2026", kind: "major" },
        { code: "C2001", title: "CS", year: "2026", kind: "minor" },
      ],
    } as unknown as AosPageData,
    NO_RATING
  )
  assert.equal(f.unitCount, 2)
  assert.deepEqual(f.campuses, [])
  assert.deepEqual(f.courses, [{ code: "C2001", title: "CS" }])
})

test("uniqueBy keeps the first item per key, in order", () => {
  assert.deepEqual(
    uniqueBy(["b1", "a1", "b2", "c1"], (s) => s[0]),
    ["b1", "a1", "c1"]
  )
})

test("downstream reach counts every unit the code leads to, once", () => {
  const e = (from: string, to: string, type = "prerequisite") => ({
    from,
    to,
    type,
  })
  // B and C need A; D needs B; C and D need each other; A lists itself.
  const edges = [
    e("B", "A"),
    e("C", "A", "corequisite"),
    e("D", "B"),
    e("C", "D"),
    e("D", "C"),
    e("A", "A"),
    // A prohibition is not a path on.
    e("X", "A", "prohibition"),
  ]
  assert.equal(downstreamReach("A", edges), 3)
  assert.equal(downstreamReach("D", edges), 1)
  assert.equal(downstreamReach("Z", edges), 0)
})
