import { test } from "node:test"
import assert from "node:assert/strict"

import { collectCodeRefs, extractCourseAosRefs, extractAosUnitRefs } from "./parse.ts"

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
