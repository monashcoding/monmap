import { test } from "node:test"
import assert from "node:assert/strict"

import {
  collectCodeRefs,
  extractCourseAosRefs,
  extractAosUnitRefs,
  extractEnrolmentRuleRefs,
} from "./parse.ts"

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const subjectLeaf = (code: string) => ({
  academic_item_code: code,
  academic_item_type: { value: "subject", label: "Unit" },
})

const courseLeaf = (code: string) => ({
  academic_item_code: code,
  academic_item_type: { value: "course", label: "Course" },
})

/* ------------------------------------------------------------------ *
 * collectCodeRefs — A13
 * ------------------------------------------------------------------ */

test("collectCodeRefs: shape-agnostic — finds leaves under `relationship` (singular) and `relationships` (plural)", () => {
  const root = {
    container: [
      {
        title: "AoS shape",
        relationship: [subjectLeaf("U1")],
      },
      {
        title: "Requisite shape",
        relationships: [subjectLeaf("U2")],
      },
    ],
  }
  const codes = collectCodeRefs(root).map((r) => r.code).sort()
  assert.deepEqual(codes, ["U1", "U2"])
})

test("collectCodeRefs: carries nearest ancestor title", () => {
  const root = {
    container: [
      { title: "Outer", container: [{ title: "Inner", relationship: [subjectLeaf("U1")] }] },
    ],
  }
  const refs = collectCodeRefs(root)
  assert.equal(refs.length, 1)
  assert.equal(refs[0]!.ancestor, "Inner")
})

test("collectCodeRefs: surfaces type=course as well as type=subject", () => {
  const root = { container: [{ title: "X", relationship: [courseLeaf("C2001")] }] }
  const refs = collectCodeRefs(root)
  assert.equal(refs.length, 1)
  assert.equal(refs[0]!.type, "course")
})

/* ------------------------------------------------------------------ *
 * extractCourseAosRefs — A10 (the campus-shadow fix)
 * ------------------------------------------------------------------ */

test("course→AoS: campus label under a Part title still classifies as specialisation (E3001 2020-2023 regression)", () => {
  // Real shape: a discipline-named Part holds campus splits at
  // depth 2, with AoS code strings appearing as depth-3 string
  // properties. Pre-fix this gave kind="other" because "Clayton"
  // shadowed the Part title.
  const structure = {
    container: [
      {
        title: "Parts C, D and E. Engineering specialisation knowledge, application and professional practice",
        container: [
          {
            title: "Clayton",
            description: "AEROENG04", // bare string AoS code (the form courses use)
          },
        ],
      },
    ],
  }
  const aosCodes = new Set(["AEROENG04"])
  const refs = extractCourseAosRefs("2023", "E3001", structure, aosCodes)
  assert.equal(refs.length, 1)
  assert.equal(refs[0]!.kind, "specialisation")
  assert.match(refs[0]!.relationshipLabel, /specialisation/i)
})

test("course→AoS: deepest classifying ancestor wins over an outer match", () => {
  // If both an outer "Part B. Major studies" and a closer
  // "Specialisation electives" classify, take the more specific one.
  const structure = {
    container: [
      {
        title: "Part B. Major studies",
        container: [
          {
            title: "Specialisation electives",
            description: "CSCYBSEC01",
          },
        ],
      },
    ],
  }
  const refs = extractCourseAosRefs("2026", "C2000", structure, new Set(["CSCYBSEC01"]))
  assert.equal(refs[0]!.kind, "specialisation")
  assert.equal(refs[0]!.relationshipLabel, "Specialisation electives")
})

test("course→AoS: when no ancestor classifies, falls back to deepest title with kind=other", () => {
  const structure = {
    container: [
      {
        title: "Course requirements",
        container: [
          {
            title: "Reference list",
            description: "REFAOS01",
          },
        ],
      },
    ],
  }
  const refs = extractCourseAosRefs("2026", "X1000", structure, new Set(["REFAOS01"]))
  assert.equal(refs[0]!.kind, "other")
  assert.equal(refs[0]!.relationshipLabel, "Reference list")
})

test("course→AoS: extended major beats major keyword priority", () => {
  const structure = {
    container: [
      {
        title: "Part A. Listed extended majors",
        description: "EXTMAJ01",
      },
    ],
  }
  const refs = extractCourseAosRefs("2026", "X1000", structure, new Set(["EXTMAJ01"]))
  assert.equal(refs[0]!.kind, "extended_major")
})

test("course→AoS: minor classification holds", () => {
  const structure = {
    container: [{ title: "Discipline minor units", description: "MIN01" }],
  }
  const refs = extractCourseAosRefs("2026", "X1000", structure, new Set(["MIN01"]))
  assert.equal(refs[0]!.kind, "minor")
})

test("course→AoS: same code+label de-duped", () => {
  const structure = {
    container: [
      {
        title: "Part B. Major studies",
        description: "MAJ01",
        container: [{ description: "MAJ01" }],
      },
    ],
  }
  const refs = extractCourseAosRefs("2026", "X1000", structure, new Set(["MAJ01"]))
  assert.equal(refs.length, 1)
})

/* ------------------------------------------------------------------ *
 * extractAosUnitRefs — A15
 * ------------------------------------------------------------------ */

test("AoS→unit: only subject-typed leaves are emitted", () => {
  const structure = {
    container: [
      {
        title: "Core",
        relationship: [
          subjectLeaf("U1"),
          courseLeaf("C9999"), // must be ignored
        ],
      },
    ],
  }
  const refs = extractAosUnitRefs("2026", "AOS01", structure, new Set(["U1"]))
  assert.deepEqual(refs.map((r) => r.unitCode), ["U1"])
})

test("AoS→unit: ancestor title becomes grouping", () => {
  const structure = {
    container: [
      { title: "Malaysia", relationship: [subjectLeaf("U1")] },
      { title: "Clayton", relationship: [subjectLeaf("U2")] },
    ],
  }
  const refs = extractAosUnitRefs("2026", "AOS01", structure, new Set(["U1", "U2"]))
  const byUnit = Object.fromEntries(refs.map((r) => [r.unitCode, r.grouping]))
  assert.equal(byUnit["U1"], "Malaysia")
  assert.equal(byUnit["U2"], "Clayton")
})

test("AoS→unit: unknown unit codes are filtered out", () => {
  const structure = {
    container: [{ title: "Core", relationship: [subjectLeaf("U1"), subjectLeaf("UNKNOWN")] }],
  }
  const refs = extractAosUnitRefs("2026", "AOS01", structure, new Set(["U1"]))
  assert.deepEqual(refs.map((r) => r.unitCode), ["U1"])
})

/* ------------------------------------------------------------------ *
 * extractEnrolmentRuleRefs — prose requisites in enrolment_rules
 * ------------------------------------------------------------------ */

const erDesc = (s: string) => [{ description: s }]
const erKey = (r: { requisiteType: string; requiresUnitCode: string }) =>
  `${r.requisiteType}:${r.requiresUnitCode}`

test("enrolment refs: a single description carrying both PREREQUISITE and PROHIBITION attributes each link to its own section (CIV4283 regression)", () => {
  const refs = extractEnrolmentRuleRefs(
    "2026",
    "CIV4283",
    erDesc(
      '<p><strong>Prerequisite: </strong><a href="http://www.monash.edu/pubs/handbooks/units/CIV2282.html">CIV2282</a></p>' +
        '<p><strong>Prohibitions:</strong> <a href="http://www.monash.edu/pubs/handbooks/units/CIV4293.html">CIV4293</a></p>',
    ),
  )
  assert.deepEqual(refs.map(erKey).sort(), [
    "prerequisite:CIV2282",
    "prohibition:CIV4293",
  ])
})

test("enrolment refs: ignores /courses/ and /aos/ links, keeps only /units/ (MTH2010 regression)", () => {
  const refs = extractEnrolmentRuleRefs(
    "2026",
    "MTH2010",
    erDesc(
      '<p><strong>PROHIBITION</strong>: <a href="https://handbook.monash.edu/current/units/ENG2005">ENG2005</a>, ' +
        '<a href="https://handbook.monash.edu/current/units/MTH2015">MTH2015</a> and incompatible with course versions ' +
        '<a href="https://handbook.monash.edu/current/courses/E3001">E3001</a>.</p>' +
        '<p><strong>PREREQUISITE</strong>: You must have passed ' +
        '<a href="https://handbook.monash.edu/current/units/MTH1030">MTH1030</a>, or MTH1040</p>',
    ),
  )
  // E3001 (/courses/) dropped; plain-text "MTH1040" (no anchor) not parsed.
  assert.deepEqual(refs.map(erKey).sort(), [
    "prerequisite:MTH1030",
    "prohibition:ENG2005",
    "prohibition:MTH2015",
  ])
})

test("enrolment refs: extracts CO-REQUISITE but drops a unit listed as its own corequisite (CHM3990 regression)", () => {
  const refs = extractEnrolmentRuleRefs(
    "2026",
    "CHM3990",
    erDesc(
      '<p><strong>Co-requisites:</strong> ' +
        '<a href="https://handbook.monash.edu/current/units/CHM3990">CHM3990</a>, ' +
        '<a href="https://handbook.monash.edu/current/units/CHM3911">CHM3911</a></p>',
    ),
  )
  assert.deepEqual(refs.map(erKey), ["corequisite:CHM3911"])
})

test("enrolment refs: prose with no <strong> requisite label yields nothing", () => {
  const refs = extractEnrolmentRuleRefs(
    "2026",
    "ABC1000",
    erDesc(
      '<p>Must be enrolled in <a href="https://handbook.monash.edu/current/courses/S6002">S6002</a>.</p>',
    ),
  )
  assert.deepEqual(refs, [])
})

test("enrolment refs: de-dupes a unit repeated within the same section", () => {
  const refs = extractEnrolmentRuleRefs(
    "2026",
    "ABC1000",
    erDesc(
      '<p><strong>Prerequisites:</strong> ' +
        '<a href="https://handbook.monash.edu/current/units/MTH1030">MTH1030</a> or ' +
        '<a href="https://handbook.monash.edu/current/units/MTH1030">MTH1030</a></p>',
    ),
  )
  assert.deepEqual(refs.map(erKey), ["prerequisite:MTH1030"])
})
