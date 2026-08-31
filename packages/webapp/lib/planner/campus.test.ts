import { test } from "node:test"
import assert from "node:assert/strict"

import {
  availableCampuses,
  courseForCampus,
  effectiveScope,
  campusTokens,
  isOutOfCampusScope,
  optionsForCampus,
  scopeMatchesCampus,
} from "./campus.ts"
import type { PlannerAreaOfStudy, PlannerCourseWithAoS } from "./types.ts"

function aos(
  code: string,
  scope: string | null = null,
  kind: PlannerAreaOfStudy["kind"] = "minor"
): PlannerAreaOfStudy {
  return {
    code,
    title: code,
    kind,
    relationshipLabel: "Engineering minors",
    scope,
    creditPoints: null,
    units: [],
    requiredUnits: [],
    requirements: [],
  }
}

/* The three values the corpus actually uses, all seven years. */

test("campusTokens splits a multi-campus scope", () => {
  assert.deepEqual(campusTokens("Caulfield and Clayton"), [
    "Caulfield",
    "Clayton",
  ])
  assert.deepEqual(campusTokens("Clayton"), ["Clayton"])
  assert.deepEqual(campusTokens("Malaysia"), ["Malaysia"])
  assert.deepEqual(campusTokens(null), [])
  assert.deepEqual(campusTokens(undefined), [])
})

test('"Caulfield and Clayton" matches BOTH campuses, not the literal string', () => {
  // The reason this module exists — an equality check would hide this
  // option from every student.
  assert.ok(scopeMatchesCampus("Caulfield and Clayton", "Clayton"))
  assert.ok(scopeMatchesCampus("Caulfield and Clayton", "Caulfield"))
  assert.ok(!scopeMatchesCampus("Caulfield and Clayton", "Malaysia"))
})

test("unscoped items match every campus", () => {
  assert.ok(scopeMatchesCampus(null, "Clayton"))
  assert.ok(scopeMatchesCampus(undefined, "Malaysia"))
})

test("no campus set matches everything — the pre-feature behaviour", () => {
  assert.ok(scopeMatchesCampus("Malaysia", null))
  assert.ok(scopeMatchesCampus("Malaysia", undefined))
})

test("matching is case-insensitive", () => {
  assert.ok(scopeMatchesCampus("clayton", "Clayton"))
  assert.ok(scopeMatchesCampus("Clayton", "CLAYTON"))
})

test("optionsForCampus hides other-campus options", () => {
  const opts = [aos("A"), aos("B", "Malaysia"), aos("C", "Clayton")]
  assert.deepEqual(
    optionsForCampus(opts, "Clayton").map((o) => o.code),
    ["A", "C"]
  )
  assert.deepEqual(
    optionsForCampus(opts, "Malaysia").map((o) => o.code),
    ["A", "B"]
  )
})

test("optionsForCampus with no campus returns everything", () => {
  const opts = [aos("A"), aos("B", "Malaysia")]
  assert.deepEqual(
    optionsForCampus(opts, undefined).map((o) => o.code),
    ["A", "B"]
  )
})

test("a current pick survives a campus that would exclude it", () => {
  // Plan §4: filter options, never delete state.
  const opts = [aos("A"), aos("B", "Malaysia")]
  assert.deepEqual(
    optionsForCampus(opts, "Clayton", "B").map((o) => o.code),
    ["A", "B"]
  )
  assert.ok(isOutOfCampusScope(aos("B", "Malaysia"), "Clayton"))
  assert.ok(!isOutOfCampusScope(aos("A"), "Clayton"))
})

test("availableCampuses reads the corpus, splitting multi-campus scopes", () => {
  const course = {
    areasOfStudy: [
      aos("A"),
      aos("B", "Malaysia"),
      aos("C", "Caulfield and Clayton"),
    ],
    courseRequirements: [],
    componentCourses: [],
  } as unknown as PlannerCourseWithAoS
  assert.deepEqual(availableCampuses(course), [
    "Caulfield",
    "Clayton",
    "Malaysia",
  ])
})

test("availableCampuses also reads requirement-group scopes", () => {
  const course = {
    areasOfStudy: [],
    courseRequirements: [
      {
        grouping: "Core studies - Malaysia",
        required: 1,
        options: ["X"],
        scope: "Malaysia",
      },
    ],
    componentCourses: [],
  } as unknown as PlannerCourseWithAoS
  assert.deepEqual(availableCampuses(course), ["Malaysia"])
})

test("availableCampuses is empty when nothing is scoped", () => {
  const course = {
    areasOfStudy: [aos("A")],
    courseRequirements: [],
    componentCourses: [],
  } as unknown as PlannerCourseWithAoS
  assert.deepEqual(availableCampuses(course), [])
})

/* ------------------------------------------------------------------ *
 * courseForCampus — the half students complained about:
 * "its telling me i need to take some units in malaysia"
 * ------------------------------------------------------------------ */

function group(grouping: string, scope?: string) {
  return {
    grouping,
    required: 1,
    options: ["X1", "X2"],
    ...(scope ? { scope } : {}),
  }
}

function course(overrides: Partial<PlannerCourseWithAoS> = {}) {
  return {
    year: "2026",
    code: "E3001",
    title: "Engineering",
    creditPoints: 192,
    aqfLevel: null,
    type: null,
    overview: null,
    areasOfStudy: [],
    courseUnits: [],
    courseRequirements: [],
    componentCourses: [],
    ...overrides,
  } as PlannerCourseWithAoS
}

test("courseForCampus drops other-campus requirement groups", () => {
  const c = course({
    courseRequirements: [
      group("Core studies"),
      group("Core studies - Malaysia", "Malaysia"),
      group("Core studies - Clayton", "Clayton"),
    ],
  })
  assert.deepEqual(
    courseForCampus(c, "Clayton").courseRequirements.map((g) => g.grouping),
    ["Core studies", "Core studies - Clayton"]
  )
})

test("courseForCampus narrows component and AoS groups too", () => {
  const c = course({
    componentCourses: [
      {
        componentTitle: "Engineering component",
        courseCode: "E3001",
        courseTitle: "Engineering",
        courseUnits: [],
        courseRequirements: [
          group("Part A"),
          group("Part A - Malaysia", "Malaysia"),
        ],
      },
    ],
    areasOfStudy: [
      {
        code: "ECSYSENG04",
        title: "Systems",
        kind: "specialisation",
        relationshipLabel: "Engineering specialisations",
        scope: null,
        creditPoints: null,
        units: [],
        requiredUnits: [],
        requirements: [group("Part C"), group("Part C - Malaysia", "Malaysia")],
      },
    ],
  })
  const narrowed = courseForCampus(c, "Clayton")
  assert.deepEqual(
    narrowed.componentCourses[0].courseRequirements.map((g) => g.grouping),
    ["Part A"]
  )
  assert.deepEqual(
    narrowed.areasOfStudy[0].requirements.map((g) => g.grouping),
    ["Part C"]
  )
})

test("courseForCampus keeps a multi-campus group for each of its campuses", () => {
  const c = course({
    courseRequirements: [group("Shared", "Caulfield and Clayton")],
  })
  for (const campus of ["Caulfield", "Clayton"])
    assert.equal(
      courseForCampus(c, campus).courseRequirements.length,
      1,
      campus
    )
  assert.equal(courseForCampus(c, "Malaysia").courseRequirements.length, 0)
})

test("courseForCampus does NOT narrow areasOfStudy themselves", () => {
  // Which options to offer is the picker's job; narrowing here would
  // make a pick vanish from the requirements panel instead of being
  // flagged.
  const c = course({
    areasOfStudy: [
      {
        code: "MALMNR01",
        title: "Malaysia minor",
        kind: "minor",
        relationshipLabel: "Engineering minors",
        scope: "Malaysia",
        creditPoints: null,
        units: [],
        requiredUnits: [],
        requirements: [],
      },
    ],
  })
  assert.equal(courseForCampus(c, "Clayton").areasOfStudy.length, 1)
})

test("no campus set returns the identical object — free for most plans", () => {
  const c = course({
    courseRequirements: [group("Core studies - Malaysia", "Malaysia")],
  })
  assert.equal(courseForCampus(c, undefined), c)
  assert.equal(courseForCampus(c, null), c)
})

/* ------------------------------------------------------------------ *
 * effectiveScope — campus that survives only in the relationship
 * label. Virtual areas of study (synthesised from embedded
 * specialisations) have no scope column: C2001's "Clayton options" and
 * "Malaysia options" specialisation pickers are exactly this, and were
 * both shown to every student until this fallback existed.
 * ------------------------------------------------------------------ */

function labelled(
  code: string,
  relationshipLabel: string,
  scope: string | null = null
) {
  const a = aos(code, scope)
  a.relationshipLabel = relationshipLabel
  return a
}

test("effectiveScope prefers the real scope column when present", () => {
  const a = labelled("X", "Clayton options", "Malaysia")
  assert.equal(effectiveScope(a, ["Clayton", "Malaysia"]), "Malaysia")
})

test("effectiveScope falls back to a campus named in the relationship label", () => {
  const a = labelled("X", "Clayton options")
  assert.equal(effectiveScope(a, ["Clayton", "Malaysia"]), "Clayton")
})

test("effectiveScope only trusts campuses the course already demonstrates", () => {
  // Guards against an unrelated label inventing a scope.
  const a = labelled("X", "Clayton options")
  assert.equal(effectiveScope(a, ["Malaysia"]), null)
  assert.equal(effectiveScope(a, []), null)
})

test("effectiveScope returns null for an ordinary label", () => {
  const a = labelled("X", "Part C. Specialist discipline knowledge")
  assert.equal(effectiveScope(a, ["Clayton", "Malaysia"]), null)
})

test("a label naming two campuses matches both", () => {
  const a = labelled("X", "Caulfield and Clayton offerings")
  assert.equal(
    effectiveScope(a, ["Caulfield", "Clayton"]),
    "Caulfield and Clayton"
  )
  assert.ok(
    scopeMatchesCampus(effectiveScope(a, ["Caulfield", "Clayton"]), "Clayton")
  )
})

test("label-scoped options are filtered like column-scoped ones", () => {
  const opts = [
    labelled("CLAY", "Clayton options"),
    labelled("MAL", "Malaysia options"),
    labelled("ANY", "Part C. Specialist discipline knowledge"),
  ]
  const known = ["Clayton", "Malaysia"]
  assert.deepEqual(
    optionsForCampus(opts, "Malaysia", undefined, known).map((o) => o.code),
    ["MAL", "ANY"]
  )
})

test("without knownCampuses the fallback is inert — old behaviour preserved", () => {
  const opts = [labelled("CLAY", "Clayton options")]
  assert.equal(optionsForCampus(opts, "Malaysia").length, 1)
})
