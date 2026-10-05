import { test } from "node:test"
import assert from "node:assert/strict"

import { extractRequirementGroups, extractSubCourseRefs } from "@monmap/db"
import type { CourseContent } from "@monmap/scraper/types"
import {
  collectCodeRefs,
  courseCreditPoints,
  foldPlaceholderUnits,
  parseCourse,
  extractCourseAosRefs,
  extractAosUnitRefs,
  extractEnrolmentRuleRefs,
  extractUnitYearLinks,
  linkedItem,
  resolveSubCourseYears,
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
 * Cross-year links (2027 courses that link 2026 pages)
 * ------------------------------------------------------------------ */

// The leaf shape 2027 S2000 uses for a major with no 2027 page.
const aosLeaf = (code: string, url: string) => ({
  academic_item_code: code,
  academic_item_type: { value: "major", label: "Major" },
  academic_item_url: url,
  child_record: { value: `Area of study: ${code}` },
})

const majorsTree = (...leaves: unknown[]) => ({
  container: [{ title: "Part B. Major studies", relationship: leaves }],
})

test("course→AoS: a leaf linking an earlier year's AoS resolves to that year", () => {
  const structure = majorsTree(aosLeaf("APPLMTH05", "/2026/aos/APPLMTH05"))
  const refs = extractCourseAosRefs(
    "2027",
    "S2000",
    structure,
    new Set(),
    new Set(["2026|APPLMTH05"]),
  )
  assert.equal(refs.length, 1)
  assert.equal(refs[0]!.courseYear, "2027")
  assert.equal(refs[0]!.aosYear, "2026")
  assert.equal(refs[0]!.aosCode, "APPLMTH05")
  assert.equal(refs[0]!.kind, "major")
})

test("course→AoS: the same-year AoS wins when both years have a row", () => {
  const structure = majorsTree(aosLeaf("APPLMTH05", "/2026/aos/APPLMTH05"))
  const refs = extractCourseAosRefs(
    "2027",
    "S2000",
    structure,
    new Set(["APPLMTH05"]),
    new Set(["2026|APPLMTH05"]),
  )
  assert.equal(refs.length, 1)
  assert.equal(refs[0]!.aosYear, "2027")
})

test("course→AoS: a cross-year link with no row in the linked year is dropped", () => {
  const structure = majorsTree(aosLeaf("APPLMTH05", "/2026/aos/APPLMTH05"))
  // A row in a year the leaf does not name is not a match either.
  const refs = extractCourseAosRefs(
    "2027",
    "S2000",
    structure,
    new Set(),
    new Set(["2025|APPLMTH05"]),
  )
  assert.equal(refs.length, 0)
})

test("course→AoS: a URL naming another code or page kind does not resolve", () => {
  const structure = majorsTree(
    aosLeaf("APPLMTH05", "/2026/aos/BIOCHEM05"),
    aosLeaf("BIOCHEM05", "/2026/units/BIOCHEM05"),
  )
  const refs = extractCourseAosRefs(
    "2027",
    "S2000",
    structure,
    new Set(),
    new Set(["2026|APPLMTH05", "2026|BIOCHEM05"]),
  )
  assert.equal(refs.length, 0)
})

test("course→AoS: without earlier-year keys, behaviour matches the same-year-only matcher", () => {
  const structure = majorsTree(
    aosLeaf("APPLMTH05", "/2026/aos/APPLMTH05"),
    aosLeaf("PHYSICS09", "/2027/aos/PHYSICS09"),
  )
  const refs = extractCourseAosRefs("2027", "S2000", structure, new Set(["PHYSICS09"]))
  assert.deepEqual(
    refs.map((r) => `${r.aosYear}|${r.aosCode}`),
    ["2027|PHYSICS09"],
  )
})

test("linkedItem: parses year and code, and checks the page kind", () => {
  assert.deepEqual(linkedItem("/2026/aos/applmth05", "aos"), {
    year: "2026",
    code: "APPLMTH05",
  })
  assert.deepEqual(linkedItem("/2026/courses/F2010", "courses"), {
    year: "2026",
    code: "F2010",
  })
  assert.equal(linkedItem("/2026/units/ENG1005", "aos"), null)
  assert.equal(linkedItem("", "aos"), null)
  assert.equal(linkedItem(undefined, "aos"), null)
})

test("extractSubCourseRefs: records the year only for a link to another year's page", () => {
  const structure = {
    container: [
      {
        title: "Design component",
        relationship: [
          { ...courseLeaf("F2010"), academic_item_url: "/2026/courses/F2010" },
        ],
      },
      {
        title: "Computer science component",
        relationship: [
          { ...courseLeaf("C2001"), academic_item_url: "/2027/courses/C2001" },
        ],
      },
    ],
  }
  const refs = extractSubCourseRefs(structure, "2027")
  assert.equal(refs.find((r) => r.courseCode === "F2010")!.year, "2026")
  assert.equal("year" in refs.find((r) => r.courseCode === "C2001")!, false)
  // Without a course year nothing is recorded (the pre-change shape).
  assert.equal(extractSubCourseRefs(structure).some((r) => "year" in r), false)
})

test("resolveSubCourseYears: keeps the year only when the same-year row is missing and the linked row exists", () => {
  const refs = [
    { componentTitle: "Design component", courseCode: "F2010", year: "2026" },
    { componentTitle: "Cyber", courseCode: "C6010", year: "2026" },
    { componentTitle: "Science", courseCode: "S2000", year: "2026" },
    { componentTitle: "Computer science", courseCode: "C2001" },
  ]
  const known = new Set(["2026|F2010", "2027|S2000", "2026|S2000"])
  const out = resolveSubCourseYears("2027", refs, known)!
  // F2010: no 2027 row, 2026 row exists.
  assert.equal(out[0]!.year, "2026")
  // C6010: no row in either year.
  assert.equal("year" in out[1]!, false)
  // S2000: the 2027 row exists, so it wins.
  assert.equal("year" in out[2]!, false)
  // Refs without a year pass through unchanged.
  assert.equal(out[3], refs[3])
  assert.equal(resolveSubCourseYears("2027", null, known), null)
})

/* ------------------------------------------------------------------ *
 * extractUnitYearLinks — units a year links to an earlier year's page
 * ------------------------------------------------------------------ */

const unitLink = (code: string, url: string) => ({
  ...subjectLeaf(code),
  academic_item_url: url,
})

test("unit year links: an earlier-year link resolves when only the linked year has the unit", () => {
  // 2027 E3001 links ENG1005 to its 2026 page; 2027 ECSE-USPEC does the
  // same for ENG2005. Neither has a 2027 row.
  const course = {
    container: [
      {
        title: "Part A. Engineering foundation studies",
        relationship: [
          unitLink("ENG1005", "/2026/units/ENG1005"),
          unitLink("ENG1011", "/2027/units/ENG1011"),
        ],
      },
    ],
  }
  const aos = {
    container: [
      { title: "Core units", relationship: [unitLink("ENG2005", " /2026/units/ENG2005 ")] },
    ],
  }
  const rows = extractUnitYearLinks(
    "2027",
    [course, aos],
    new Set(["ENG1011"]),
    new Set(["2026|ENG1005", "2026|ENG2005", "2026|ENG1011"]),
  )
  assert.deepEqual(rows, [
    { year: "2027", unitCode: "ENG1005", linkedYear: "2026" },
    { year: "2027", unitCode: "ENG2005", linkedYear: "2026" },
  ])
})

test("unit year links: a unit the year has a row for never falls back", () => {
  const tree = { relationship: [unitLink("FIT1045", "/2026/units/FIT1045")] }
  const rows = extractUnitYearLinks(
    "2027",
    [tree],
    new Set(["FIT1045"]),
    new Set(["2026|FIT1045"]),
  )
  assert.deepEqual(rows, [])
})

test("unit year links: a link with no row in the linked year is dropped", () => {
  // 2027 A6014 links /2024/units/APG5064, which 2024 never published.
  const tree = { relationship: [unitLink("APG5064", "/2024/units/APG5064")] }
  assert.deepEqual(
    extractUnitYearLinks("2027", [tree], new Set(), new Set(["2023|APG5064"])),
    [],
  )
})

test("unit year links: a unit only present in an earlier year is not enough without a link", () => {
  // A retired unit: listed by code, linked to its own year's page.
  const tree = { relationship: [unitLink("FIT9999", "/2027/units/FIT9999"), subjectLeaf("FIT8888")] }
  assert.deepEqual(
    extractUnitYearLinks(
      "2027",
      [tree],
      new Set(),
      new Set(["2026|FIT9999", "2026|FIT8888"]),
    ),
    [],
  )
})

test("unit year links: later-year and non-unit links are ignored, and the latest earlier year wins", () => {
  const tree = {
    container: [
      { relationship: [unitLink("MEC5891", "/2025/units/MEC5891")] },
      { relationship: [unitLink("MEC5891", "/2026/units/MEC5891")] },
      { relationship: [unitLink("ENG1005", "/2028/units/ENG1005")] },
      { relationship: [{ academic_item_code: "APPLMTH05", academic_item_url: "/2026/aos/APPLMTH05" }] },
    ],
  }
  const rows = extractUnitYearLinks(
    "2027",
    [tree, null, undefined],
    new Set(),
    new Set(["2025|MEC5891", "2026|MEC5891", "2028|ENG1005", "2026|APPLMTH05"]),
  )
  assert.deepEqual(rows, [
    { year: "2027", unitCode: "MEC5891", linkedYear: "2026" },
  ])
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
 * Whitespace-padded codes
 *
 * CourseLoop occasionally emits `academic_item_code` values padded
 * with spaces or tabs — observed in the live corpus as "ETW2001 ",
 * " AMU1312" and "BFF5525\t\t". Consumers that filter against a known
 * code set (AoS unit refs, course→AoS refs) dropped these silently,
 * which is why area_of_study_units showed zero padded rows. Requisite
 * refs are stored verbatim, so an untrimmed code was written straight
 * into requisite_refs, matched no unit row, and surfaced as a
 * prerequisite the student could never satisfy.
 * ------------------------------------------------------------------ */

test("collectCodeRefs trims padded academic_item_code values", () => {
  const refs = collectCodeRefs({
    container: [
      {
        title: "Prerequisites",
        relationships: [
          { academic_item_code: "ETW2001 ", academic_item_type: { value: "subject" } },
          { academic_item_code: " AMU1312", academic_item_type: { value: "subject" } },
          { academic_item_code: "BFF5525\t\t", academic_item_type: { value: "subject" } },
          { academic_item_code: "\n FIT1045 \n", academic_item_type: { value: "subject" } },
        ],
      },
    ],
  })
  assert.deepEqual(
    refs.map((r) => r.code),
    ["ETW2001", "AMU1312", "BFF5525", "FIT1045"]
  )
})

test("trimming does not disturb codes that were already clean", () => {
  const refs = collectCodeRefs({
    relationships: [
      { academic_item_code: "FIT1008", academic_item_type: { value: "subject" } },
    ],
  })
  assert.deepEqual(refs, [
    { code: "FIT1008", type: "subject", ancestor: null },
  ])
})

test("a padded requisite code resolves to the same ref as its clean twin", () => {
  // The bug's actual shape: two spellings of one unit must collapse to
  // one requisite ref, not two, one of which never matches a unit row.
  const padded = collectCodeRefs({
    relationships: [
      { academic_item_code: "MTE2544 ", academic_item_type: { value: "subject" } },
    ],
  })
  const clean = collectCodeRefs({
    relationships: [
      { academic_item_code: "MTE2544", academic_item_type: { value: "subject" } },
    ],
  })
  assert.deepEqual(padded, clean)
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

/* ------------------------------------------------------------------ *
 * Course credit points from the curriculum tree
 * ------------------------------------------------------------------ */

const course = (fields: Record<string, unknown>) =>
  ({ code: "X0000", title: "Test course", ...fields }) as unknown as CourseContent

test("course credit points: the page value wins when present", () => {
  const raw = course({ credit_points: "144", curriculumStructure: { credit_points: "96", container: [] } })
  assert.equal(courseCreditPoints(raw), 144)
})

test("course credit points: a blank page value falls back to the tree root (2027 B2057)", () => {
  const raw = course({ credit_points: "", curriculumStructure: { credit_points: "144", container: [] } })
  assert.equal(courseCreditPoints(raw), 144)
})

test("course credit points: a 0 root sums the top-level containers, skipping Rules (2027 C2009)", () => {
  const raw = course({
    credit_points: "",
    curriculumStructure: {
      credit_points: "0",
      container: [
        { title: "Rules", credit_points: "192" },
        { title: "Artificial Intelligence component ", credit_points: "96" },
        { title: "Bachelor of Arts component", credit_points: "96" },
      ],
    },
  })
  assert.equal(courseCreditPoints(raw), 192)
})

test("course credit points: no page value and no tree stays null", () => {
  assert.equal(courseCreditPoints(course({ credit_points: "" })), null)
  assert.equal(
    courseCreditPoints(course({ credit_points: "", curriculumStructure: { credit_points: "0", container: [] } })),
    null,
  )
})

test("parseCourse stores the fallback credit points", () => {
  const raw = course({ credit_points: "", curriculumStructure: { credit_points: "48", container: [] } })
  assert.equal(parseCourse("2027", raw).course.creditPoints, 48)
})

/* ------------------------------------------------------------------ *
 * Placeholder unit containers (2027 C2005 and friends)
 * ------------------------------------------------------------------ */

const leaf6 = (code: string, order = "100") => ({
  ...subjectLeaf(code),
  academic_item_credit_points: "6",
  order,
})
const placeholder = (title: string, cp = "6", order = "300") => ({
  title,
  credit_points: cp,
  description: "This unit is under development",
  container: [],
  relationship: [],
  order,
  parent_connector: { label: "AND", value: "AND" },
})
const units = (...codes: string[]) => new Set(codes)

test("placeholders: a container that the placeholders complete exactly is folded (C2005 Part A)", () => {
  const partA = {
    title: "Part A. Foundation studies",
    credit_points: "24",
    relationship: [leaf6("FIT1045"), leaf6("FIT1047"), leaf6("FIT1059")],
    container: [placeholder("FIT1066 Responsible use of data in the age of AI")],
  }
  const root = { container: [partA] }
  const { structure, folded } = foldPlaceholderUnits(
    root,
    units("FIT1045", "FIT1047", "FIT1059", "FIT1066"),
  )
  assert.deepEqual(folded, ["FIT1066"])
  const groups = extractRequirementGroups(structure, 144)
  assert.deepEqual(groups[0]!.options, ["FIT1045", "FIT1047", "FIT1059", "FIT1066"])
  assert.equal(groups[0]!.required, 4)
  // The input tree is never mutated.
  assert.equal(partA.relationship.length, 3)
  assert.equal(partA.container.length, 1)
})

test("placeholders: a pick-some list gains options but keeps its required count (C2005 Electives)", () => {
  const root = {
    container: [
      {
        title: "Electives",
        credit_points: "12",
        relationship: [leaf6("FIT3191"), leaf6("FIT3192"), leaf6("FIT3203")],
        container: [placeholder("FIT3233 Optimisation and reinforcement learning")],
      },
    ],
  }
  const { structure, folded } = foldPlaceholderUnits(root, units("FIT3191", "FIT3192", "FIT3203", "FIT3233"))
  assert.deepEqual(folded, ["FIT3233"])
  const [g] = extractRequirementGroups(structure, 144)
  assert.equal(g!.options.length, 4)
  assert.equal(g!.required, 2)
})

test("placeholders: a container its leaves already fill is left alone (2027 M3008 Core studies)", () => {
  const root = {
    container: [
      {
        title: "Core studies",
        credit_points: "12",
        relationship: [leaf6("SPH1000"), leaf6("SPH1001")],
        container: [placeholder("SPH2001 Motor speech disorders")],
      },
    ],
  }
  const out = foldPlaceholderUnits(root, units("SPH1000", "SPH1001", "SPH2001"))
  assert.deepEqual(out.folded, [])
  assert.equal(out.structure, root)
})

test("placeholders: a code with no unit row in the year blocks the fold", () => {
  const root = {
    container: [
      {
        title: "Core studies",
        credit_points: "12",
        relationship: [leaf6("BMS1111")],
        container: [placeholder("BMS2111 Not published yet")],
      },
    ],
  }
  assert.deepEqual(foldPlaceholderUnits(root, units("BMS1111")).folded, [])
})

test("placeholders: notes without credit points and codes already listed are not units (2026 S2000)", () => {
  const root = {
    container: [
      {
        title: "Mathematics and statistics unit",
        credit_points: "6",
        relationship: [leaf6("MTH1020"), leaf6("STA1010")],
        container: [
          placeholder("MTH1020 Analysis of change is recommended", ""),
          placeholder("SCI1022 Introduction to scientific coding is recommended", ""),
        ],
      },
    ],
  }
  assert.deepEqual(foldPlaceholderUnits(root, units("MTH1020", "STA1010", "SCI1022")).folded, [])
})

test("placeholders: a credit-bearing sibling container blocks the fold", () => {
  const root = {
    container: [
      {
        title: "Part C",
        credit_points: "24",
        relationship: [leaf6("FIT2119")],
        container: [
          placeholder("FIT2120 Project practices"),
          { title: "Other stream", credit_points: "12", container: [], relationship: [leaf6("FIT9999")] },
        ],
      },
    ],
  }
  assert.deepEqual(foldPlaceholderUnits(root, units("FIT2119", "FIT2120", "FIT9999")).folded, [])
})

test("placeholders: parseCourse folds only when it is given the year's unit codes", () => {
  const raw = course({
    credit_points: "24",
    curriculumStructure: {
      container: [
        {
          title: "Core studies",
          credit_points: "24",
          relationship: [],
          container: ["EDF5320", "EDF5321", "EDF5322", "EDF5323"].map((c) => placeholder(`${c} Unit`)),
        },
      ],
    },
  })
  assert.deepEqual(parseCourse("2027", raw).course.requirementGroups, [])
  const groups = parseCourse("2027", raw, units("EDF5320", "EDF5321", "EDF5322", "EDF5323")).course.requirementGroups!
  assert.deepEqual(groups[0]!.options, ["EDF5320", "EDF5321", "EDF5322", "EDF5323"])
  assert.equal(groups[0]!.autoLoad, true)
  // The stored tree stays verbatim.
  assert.equal(parseCourse("2027", raw, units("EDF5320")).course.curriculumStructure, raw.curriculumStructure)
})
