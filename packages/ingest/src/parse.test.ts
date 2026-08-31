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

test("course→AoS: campus scope is read off the ancestor path", () => {
  // E3001's shape: the minors container splits by campus, and the kind
  // classifier deliberately looks *past* those splits (it needs
  // "Engineering minors" to classify the kind), so scope is read on its
  // own pass over the same ancestors.
  const structure = {
    container: [
      {
        title: "Engineering minors",
        container: [
          { title: "Clayton offerings", description: "CIVENMNR03" },
          { title: "Malaysia offerings", description: "IOTMNR01" },
        ],
      },
      {
        title: "Parts C, D and E. Specialist studies",
        description: "ECSYSENG04",
      },
    ],
  }
  const rows = extractCourseAosRefs(
    "2026",
    "E3001",
    structure,
    new Set(["CIVENMNR03", "IOTMNR01", "ECSYSENG04"]),
  )
  const byCode = new Map(rows.map((r) => [r.aosCode, r]))
  assert.equal(byCode.get("CIVENMNR03")?.scope, "Clayton")
  assert.equal(byCode.get("IOTMNR01")?.scope, "Malaysia")
  assert.equal(byCode.get("ECSYSENG04")?.scope, null, "unscoped stays null")
  // The campus container must not swallow the kind classification.
  assert.equal(byCode.get("CIVENMNR03")?.kind, "minor")
  assert.equal(byCode.get("ECSYSENG04")?.kind, "specialisation")
})

/* ------------------------------------------------------------------ *
 * Majors vs extended majors.
 *
 * A2000 was inverted in every year but 2026: 1 major and 27-29
 * extended majors in 2022-2025, against 29 majors and 1 extended major
 * in 2026 — for the same AoS codes. Two separate defects, both
 * reachable from the real corpus labels below, and together they are
 * feedback #66/#74/#70 ("Arts majors and extended majors are swapped;
 * psychology is the only major").
 * ------------------------------------------------------------------ */

function aosRef(label: string, code = "ANTHROPL11") {
  const structure = {
    container: [
      { title: label, relationship: [{ academic_item_code: code }] },
    ],
  }
  return extractCourseAosRefs("2022", "A2000", structure, new Set([code]))[0]!
}

test("a container listing both kinds classifies as major, not extended", () => {
  // The real 2022-2025 A2000 label. 2026 splits the same codes into
  // "Part A. Major studies", so major is the verdict this must reach.
  assert.equal(
    aosRef("Part A. Arts listed majors and extended major").kind,
    "major"
  )
})

test("a container naming only an extended major still classifies extended", () => {
  assert.equal(aosRef("European languages extended major").kind, "extended_major")
  assert.equal(aosRef("Science extended majors").kind, "extended_major")
})

test("stray double spaces no longer defeat the extended-major match", () => {
  // Verbatim from the corpus, double spaces and all. This used to fall
  // through to plain "major" — making a genuine extended major the only
  // thing A2000 called a major.
  assert.equal(
    aosRef("APAC  - Psychology extended  major").kind,
    "extended_major"
  )
})

test("the 2026 spelling is unaffected", () => {
  assert.equal(aosRef("Part A. Major studies").kind, "major")
})

test("minors, electives and specialisations are untouched by the change", () => {
  assert.equal(aosRef("Engineering minors").kind, "minor")
  assert.equal(aosRef("Arts elective units").kind, "elective")
  assert.equal(aosRef("Discipline elective studies").kind, "elective")
  assert.equal(aosRef("Engineering specialisations").kind, "specialisation")
})

test("leading and trailing whitespace is trimmed before matching", () => {
  assert.equal(aosRef("  Part A. Major studies  ").kind, "major")
})
