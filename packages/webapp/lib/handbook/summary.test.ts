import assert from "node:assert/strict"
import { test } from "node:test"

import {
  aosDescription,
  courseDescription,
  courseLede,
  plain,
  ruleSegs,
  scaleWord,
  unitDescription,
  unitLede,
  unitQuestions,
  type RatingFacts,
  type UnitFacts,
} from "./summary.ts"

const NO_RATING: RatingFacts = {
  average: null,
  count: 0,
  axes: {},
  distribution: [0, 0, 0, 0, 0],
}

const leaf = (code: string) => ({ academic_item_code: code })

test("rules read as words with and/or and brackets", () => {
  // (FIT1008 or FIT1054) and MAT1830
  const rule = [
    {
      parent_connector: { value: "AND" },
      containers: [
        {
          parent_connector: { value: "OR" },
          relationships: [leaf("FIT1008"), leaf("FIT1054")],
        },
        { relationships: [leaf("MAT1830")] },
      ],
    },
  ]
  assert.equal(plain(ruleSegs(rule)!), "(FIT1008 or FIT1054) and MAT1830")
  assert.equal(
    plain(
      ruleSegs([
        {
          parent_connector: { value: "OR" },
          relationships: [leaf("A1"), leaf("B2"), leaf("C3")],
        },
      ])!
    ),
    "A1, B2 or C3"
  )
  // A box that only wraps one group is that group.
  assert.equal(
    plain(ruleSegs([{ containers: [{ relationships: [leaf("X1")] }] }])!),
    "X1"
  )
  assert.equal(ruleSegs([]), null)
  assert.equal(ruleSegs(null), null)
})

const base: UnitFacts = {
  code: "FIT2004",
  title: "Algorithms and data structures",
  year: "2027",
  creditPoints: 6,
  level: 2,
  study: "Undergraduate",
  school: "Faculty of Information Technology",
  periods: ["Semester 1", "Semester 2"],
  campuses: ["Clayton", "Malaysia"],
  online: false,
  prerequisites: [{ relationships: [leaf("FIT1008")] }],
  corequisites: null,
  hasEnrolmentRules: false,
  unlocks: ["FIT3155", "FIT3143"],
  leadsTo: 9,
  examWeight: 60,
  assessmentCount: 4,
  workloadHours: 144,
  areasOfStudy: [{ code: "SFTWRDEV08", title: "Software development" }],
  rating: NO_RATING,
}

test("a unit with no ratings asks no rating questions", () => {
  const ids = unitQuestions(base).map((q) => q.id)
  assert.deepEqual(ids, [
    "prerequisites",
    "unlocks",
    "offered",
    "workload",
    "exam",
    "majors",
  ])
  assert.ok(!plain(unitLede(base)).includes("rate"))
})

test("ratings add difficulty and opinion answers", () => {
  const rating: RatingFacts = {
    average: 4.25,
    count: 4,
    axes: { difficulty: { average: 4.2, count: 3 } },
    distribution: [0, 0, 1, 1, 2],
  }
  const f = { ...base, rating }
  const qs = unitQuestions(f)
  const diff = qs.find((q) => q.id === "difficulty")
  assert.ok(diff && plain(diff.answer).includes("hard to do well in"))
  const op = qs.find((q) => q.id === "reviews")
  assert.ok(
    op && plain(op.answer).includes("3 students of 4 gave it 4 or 5 stars")
  )
  assert.match(
    plain(unitLede(f)),
    /rate it 4\.3 out of 5 from 4 reviews and call it hard/
  )
  assert.equal(scaleWord(rating, "workload"), null)
})

test("the lede words a unit's place in the graph", () => {
  const text = plain(unitLede(base))
  assert.match(text, /level 2, 6-credit-point, undergraduate unit/)
  assert.match(
    text,
    /It needs FIT1008 and unlocks 2 units, leading on to 9 units in all\./
  )
  const none = plain(
    unitLede({ ...base, prerequisites: null, unlocks: [], periods: [] })
  )
  assert.match(none, /isn't offered in 2027\. It has no prerequisites\./)
})

test("descriptions fit in 160 characters", () => {
  const long = {
    ...base,
    title: "A very long unit title about many things ".repeat(4),
  }
  assert.ok(unitDescription(long).length <= 160)
  assert.ok(unitDescription(base).length <= 160)
  assert.ok(
    courseDescription({
      code: "C2001",
      title: "Bachelor of Computer Science",
      year: "2027",
      creditPoints: 144,
      duration: "3 years",
      qualification: "Bachelor degree",
      school: null,
      campuses: ["Clayton"],
      atar: null,
      aos: [{ code: "X", title: "X", kind: "major" }],
      rating: NO_RATING,
    }).length <= 160
  )
  assert.ok(
    aosDescription({
      code: "SFTWRDEV08",
      title: "Software development",
      year: "2027",
      kind: "major",
      creditPoints: 48,
      unitCount: 12,
      unitCodes: [],
      campuses: [],
      courses: [],
      rating: NO_RATING,
    }).length <= 160
  )
})

test("scale words are the review form's steps, lowercased", () => {
  const rated = (average: number): RatingFacts => ({
    ...NO_RATING,
    axes: {
      difficulty: { average, count: 3 },
      workload: { average, count: 3 },
    },
  })
  assert.equal(scaleWord(rated(3.9), "difficulty"), "hard")
  assert.equal(scaleWord(rated(1), "workload"), "very light")
  assert.equal(scaleWord(rated(5.4), "workload"), "very heavy")
  assert.equal(scaleWord(rated(3), "overall"), null)
})

test("a course lede counts its areas of study by kind", () => {
  const aos = [
    { code: "M1", title: "M1", kind: "major" },
    { code: "M2", title: "M2", kind: "major" },
    { code: "S1", title: "S1", kind: "specialisation" },
    { code: "N1", title: "N1", kind: "minor" },
    { code: "O1", title: "O1", kind: "other" },
  ]
  const lede = plain(
    courseLede({
      code: "C2001",
      title: "Bachelor of Computer Science",
      year: "2027",
      creditPoints: 144,
      duration: "3 years",
      qualification: "Bachelor Degree",
      school: null,
      campuses: [],
      atar: null,
      aos,
      rating: NO_RATING,
    })
  )
  assert.match(lede, /choose from 2 majors, 1 minor and 1 specialisation\./)
})
