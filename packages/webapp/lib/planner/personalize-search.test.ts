import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildPersonalSignals,
  personalScore,
  rankCandidates,
  slotContextFor,
  suggestionPool,
  topFeatures,
} from "./personalize-search.ts"
import {
  offering as fixtureOffering,
  planState,
  prereq,
  requisite,
  unit as fixtureUnit,
} from "./test-fixtures.ts"
import type {
  PlannerAreaOfStudy,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "./types.ts"

const unit = (code: string, level: string | null = null) =>
  fixtureUnit(code, { level })

const offering = (periodKind: PlannerOffering["periodKind"]) =>
  fixtureOffering("X", periodKind)

function state(): PlannerState {
  return planState([
    { S1: ["FIT1008"], S2: [] },
    { S1: [], S2: [] },
  ])
}

function emptyAos(
  kind: PlannerAreaOfStudy["kind"],
  code: string
): PlannerAreaOfStudy {
  return {
    code,
    title: code,
    kind,
    relationshipLabel: "Major",
    creditPoints: 48,
    units: [],
    requiredUnits: [],
    requirements: [],
  }
}

function course(): PlannerCourseWithAoS {
  return {
    year: "2026",
    code: "C2000",
    title: "Test course",
    creditPoints: 144,
    aqfLevel: "7",
    type: "Bachelor",
    courseUnits: [{ code: "FIT1008", grouping: "Core" }],
    courseRequirements: [
      { grouping: "Core", required: 1, options: ["FIT1008"] },
    ],
    componentCourses: [],
    areasOfStudy: [
      {
        ...emptyAos("major", "M-DEV"),
        units: [
          { code: "FIT2014", grouping: "Year 2 core" },
          { code: "FIT2099", grouping: "Year 2 core" },
        ],
        requiredUnits: [{ code: "FIT2014", grouping: "Year 2 core" }],
        requirements: [
          {
            grouping: "Year 2 core",
            required: 2,
            options: ["FIT2014", "FIT2099"],
          },
        ],
      },
      {
        ...emptyAos("minor", "M-MIN"),
        units: [{ code: "FIT3144", grouping: "Year 3 minor" }],
        requirements: [
          { grouping: "Year 3 minor", required: 1, options: ["FIT3144"] },
        ],
      },
    ],
  }
}

test("buildPersonalSignals collects placed/AoS/fillsGap/prohibited/neighbours", () => {
  const requisites = new Map<string, RequisiteBlock[]>([
    [
      "FIT1008",
      [
        requisite("prohibition", ["FIT1054"]),
        requisite("prerequisite", ["MAT1830"]),
      ],
    ],
  ])

  const signals = buildPersonalSignals(state(), course(), requisites)

  assert.deepEqual([...signals.placed].sort(), ["FIT1008"])
  // course unit + major (1.0), minor (0.7)
  assert.equal(signals.aosWeight.get("FIT1008"), 1.0)
  assert.equal(signals.aosWeight.get("FIT2014"), 1.0)
  assert.equal(signals.aosWeight.get("FIT3144"), 0.7)
  // FIT2014 + FIT2099 are unmet major options, FIT3144 is unmet minor
  assert.ok(signals.fillsGap.has("FIT2014"))
  assert.ok(signals.fillsGap.has("FIT2099"))
  assert.ok(signals.fillsGap.has("FIT3144"))
  // FIT1008 is placed so it's not a gap-filler
  assert.ok(!signals.fillsGap.has("FIT1008"))
  // placed FIT1008 prohibits FIT1054
  assert.ok(signals.prohibitedByPlaced.has("FIT1054"))
  // placed FIT1008's prereqs include MAT1830
  assert.ok(signals.prereqOfPlaced.has("MAT1830"))
})

test("slotContextFor includes earlier slots in completedBefore but not concurrent", () => {
  const s = planState([
    { S1: ["FIT1008", "MAT1830"], S2: ["FIT1045"] },
    { S1: ["FIT2099"], S2: [] },
  ])
  const ctx = slotContextFor(s, 1, 0) // Year 2 S1
  assert.deepEqual([...ctx.completedBefore].sort(), [
    "FIT1008",
    "FIT1045",
    "MAT1830",
  ])
  assert.deepEqual([...ctx.concurrentWith].sort(), ["FIT2099"])
  assert.equal(ctx.slotKind, "S1")
  assert.equal(ctx.expectedHandbookYear, "2027")
})

test("personalScore: prereq-ready vs not-ready", () => {
  const signals = buildPersonalSignals(state(), course(), new Map())
  const slot = slotContextFor(state(), 1, 0) // Year 2 S1, completedBefore = FIT1008
  const unitWithMet = unit("FIT2014", "Level 2")
  const unitWithUnmet = unit("FIT2015", "Level 2")
  const requisitesMet = [requisite("prerequisite", ["FIT1008"])]
  const requisitesUnmet = [requisite("prerequisite", ["FIT9999"])]

  const met = personalScore({
    unit: unitWithMet,
    offerings: [offering("S1")],
    requisites: requisitesMet,
    signals,
    slot,
  })
  const unmet = personalScore({
    unit: unitWithUnmet,
    offerings: [offering("S1")],
    requisites: requisitesUnmet,
    signals,
    slot,
  })

  assert.equal(met.prereqReady, 1)
  assert.equal(unmet.prereqReady, 0)
  assert.ok(met.total > unmet.total)
})

test("personalScore: slot period match dominates over no match", () => {
  const signals = buildPersonalSignals(state(), null, new Map())
  const slot = slotContextFor(state(), 0, 0) // Year 1 S1
  const fits = personalScore({
    unit: unit("FIT1045"),
    offerings: [offering("S1")],
    requisites: [],
    signals,
    slot,
  })
  const doesNot = personalScore({
    unit: unit("FIT1046"),
    offerings: [offering("S2")],
    requisites: [],
    signals,
    slot,
  })
  assert.equal(fits.periodFit, 1)
  assert.equal(doesNot.periodFit, 0)
  assert.ok(fits.total > doesNot.total + 3) // periodFit weight is 4
})

test("personalScore: placed and prohibited are hard-killed", () => {
  const requisites = new Map<string, RequisiteBlock[]>([
    ["FIT1008", [requisite("prohibition", ["FIT1054"])]],
  ])
  const signals = buildPersonalSignals(state(), course(), requisites)
  const slot = slotContextFor(state(), 0, 1) // Year 1 S2

  const placed = personalScore({
    unit: unit("FIT1008"),
    offerings: [offering("S2")],
    requisites: [],
    signals,
    slot,
  })
  const prohibited = personalScore({
    unit: unit("FIT1054"),
    offerings: [offering("S2")],
    requisites: [],
    signals,
    slot,
  })
  const normal = personalScore({
    unit: unit("FIT1099"),
    offerings: [offering("S2")],
    requisites: [],
    signals,
    slot,
  })
  assert.ok(placed.total < normal.total - 50)
  assert.ok(prohibited.total < normal.total - 50)
})

test("rankCandidates: sorts fits/gap/aos-relevant unit before noise", () => {
  const requisites = new Map<string, RequisiteBlock[]>()
  const signals = buildPersonalSignals(state(), course(), requisites)
  const slot = slotContextFor(state(), 1, 0) // Year 2 S1

  const candidates: PlannerUnit[] = [
    unit("ZZZ9999", "Level 1"), // noise
    unit("FIT2014", "Level 2"), // major AoS unit, fills gap, level matches
    unit("FIT3144", "Level 3"), // minor AoS unit
  ]
  const offerings = new Map<string, PlannerOffering[]>([
    ["ZZZ9999", [offering("S1")]],
    ["FIT2014", [offering("S1")]],
    ["FIT3144", [offering("S1")]],
  ])
  const ranked = rankCandidates(candidates, {
    signals,
    slot,
    offeringsByCode: offerings,
    requisitesByCode: requisites,
  })

  assert.equal(ranked[0].unit.code, "FIT2014")
  assert.notEqual(ranked[ranked.length - 1].unit.code, "FIT2014")
})

test("topFeatures: surfaces the dominant positive contributions", () => {
  const signals = buildPersonalSignals(state(), course(), new Map())
  const slot = slotContextFor(state(), 1, 0)
  const score = personalScore({
    unit: unit("FIT2014", "Level 2"),
    offerings: [offering("S1")],
    requisites: [],
    signals,
    slot,
  })
  const features = topFeatures(score)
  assert.ok(features.includes("periodFit"))
  assert.ok(features.includes("aos") || features.includes("fillsGap"))
  assert.ok(features.length <= 3)
})

test("slotContextFor counts credit and equivalents as completed", () => {
  const s = planState([{ S1: ["FIT1053"], S2: [] }], {
    credit: [{ code: "MAT1830", creditPoints: 6 }],
  })
  const units = new Map([
    ["FIT1053", fixtureUnit("FIT1053", { equivalents: ["FIT1045"] })],
  ])
  const ctx = slotContextFor(s, 0, 1, units)
  assert.deepEqual([...ctx.completedBefore].sort(), [
    "FIT1045",
    "FIT1053",
    "MAT1830",
  ])
})

test("personalScore: a credited prerequisite makes a unit prereq-ready", () => {
  const s = planState([{ S1: [], S2: [] }], {
    credit: [{ code: "FIT1045", creditPoints: 6 }],
  })
  const signals = buildPersonalSignals(s, course(), new Map())
  const score = personalScore({
    unit: unit("FIT1008", "Level 1"),
    offerings: [offering("S1")],
    requisites: [prereq("FIT1045")],
    signals,
    slot: slotContextFor(s, 0, 0),
  })
  assert.equal(score.prereqReady, 1)
  // Credit counts as held: a credited unit isn't suggested again.
  assert.ok(signals.placed.has("FIT1045"))
})

test("buildPersonalSignals: a group capped by a prohibition stops filling gaps", () => {
  // The group asks for all three, but A (placed) prohibits B, so it
  // can reach only two, and A and C are both placed.
  const c: PlannerCourseWithAoS = {
    ...course(),
    courseRequirements: [
      { grouping: "G", required: 3, options: ["A", "B", "C"] },
    ],
    conflicts: { B: ["A"], A: ["B"] },
  }
  const s = planState([{ S1: ["A", "C"], S2: [] }])
  const signals = buildPersonalSignals(s, c, new Map())
  assert.ok(!signals.fillsGap.has("B"))
})

test("personalScore: a level 10 unit is far from first year, not level 1", () => {
  const signals = buildPersonalSignals(state(), course(), new Map())
  const slot = slotContextFor(state(), 0, 0)
  const score = (level: string) =>
    personalScore({
      unit: unit("X", level),
      offerings: [],
      requisites: [],
      signals,
      slot,
    }).levelMatch
  assert.equal(score("Level 1"), 1)
  assert.equal(score("Postgraduate Level 10"), 0)
})

test("suggestionPool: course template, then AoS units, minus planned and unloaded", () => {
  const c = course()
  c.componentCourses = [
    {
      componentTitle: "Other component",
      courseCode: "C3000",
      courseTitle: "Other",
      courseUnits: [{ code: "ENG1005", grouping: "Core" }],
      courseRequirements: [],
    },
  ]
  const units = new Map(
    ["FIT1008", "ENG1005", "FIT2014", "FIT3144"].map((code) => [
      code,
      unit(code),
    ])
  )
  const pool = suggestionPool(c, new Set(["FIT1008"]), units)
  // FIT1008 is planned; FIT2099 has no unit data yet.
  assert.deepEqual(
    pool.map((u) => u.code),
    ["ENG1005", "FIT2014", "FIT3144"]
  )
})
